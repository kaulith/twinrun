import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { Inconclusive } from "./inconclusive.js";

export interface Fingerprint {
  image: string;
  emulator: string;
  gpu: string;
  size: string;
  sizeOverride: string;
  density: string;
  densityOverride: string;
  fontScale: string;
  locale: string;
  nightMode: string;
  navigationMode: string;
  windowAnimationScale: string;
  transitionAnimationScale: string;
  animatorDurationScale: string;
  demoMode: string;
}

const pinned: Partial<Fingerprint> = {
  sizeOverride: "none",
  densityOverride: "none",
  fontScale: "1.0",
  locale: "en-US",
  nightMode: "no",
  navigationMode: "2",
  windowAnimationScale: "0",
  transitionAnimationScale: "0",
  animatorDurationScale: "0",
  demoMode: "1",
};

const pinCommands = [
  "wm size reset",
  "wm density reset",
  "settings put system font_scale 1.0",
  "cmd uimode night no",
  "cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural",
  "settings put global window_animation_scale 0",
  "settings put global transition_animation_scale 0",
  "settings put global animator_duration_scale 0",
  "settings put global sysui_demo_allowed 1",
  "settings put global sysui_tuner_demo_on 1",
  "am broadcast -a com.android.systemui.demo -e command clock -e hhmm 1200",
  "am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false",
  "am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4",
  "am broadcast -a com.android.systemui.demo -e command network -e mobile show -e datatype none -e level 4",
  "am broadcast -a com.android.systemui.demo -e command notifications -e visible false",
];

const userCertificates = "/data/misc/user/0/cacerts-added";

export class Device {
  constructor(private readonly serial: string) {}

  async ready(ca: string): Promise<Fingerprint> {
    if ((await this.adb("root")).includes("cannot")) throw new Inconclusive("adbd cannot run as root; D14 needs a google_apis image");
    await until("adbd as root", async () => (await this.shell("id -u")) === "0");
    await until("boot completed", async () => (await this.shell("getprop sys.boot_completed")) === "1");
    await until("package manager", async () => (await this.shell("pm path android")).startsWith("package:"));
    await until("system error dialogs to clear", async () => !/Application (Not Responding|Error):/.test(await this.shell("dumpsys window windows")));
    for (const command of pinCommands) await this.shell(command);
    await this.trust(ca);
    const fingerprint = await this.fingerprint();
    matchFingerprint(pinned, fingerprint);
    return fingerprint;
  }

  async check(expected: Fingerprint): Promise<Fingerprint> {
    const fingerprint = await this.fingerprint();
    matchFingerprint(expected, fingerprint);
    return fingerprint;
  }

  private async trust(ca: string): Promise<void> {
    const name = `${await run("openssl", ["x509", "-subject_hash_old", "-noout", "-in", ca])}.0`;
    const scratch = await mkdtemp(join(tmpdir(), "twinrun-"));
    try {
      await run("openssl", ["x509", "-in", ca, "-outform", "DER", "-out", join(scratch, name)]);
      await this.shell(`mkdir -p ${userCertificates}`);
      await this.adb("push", join(scratch, name), `${userCertificates}/${name}`);
    } finally {
      await rm(scratch, { recursive: true });
    }
    await this.shell(`chown -R system:system ${userCertificates} && chmod 644 ${userCertificates}/${name} && restorecon -R ${userCertificates}`);
    await this.shell(`ls ${userCertificates}/${name}`);
  }

  private async fingerprint(): Promise<Fingerprint> {
    const avd = (await this.adb("emu", "avd", "path")).split(/\r?\n/)[0];
    const hardware = await readFile(join(avd, "hardware-qemu.ini"), "utf8");
    const emulatorPackage = await readFile(join(property(hardware, "android.sdk.root"), "emulator", "source.properties"), "utf8");
    const [size, sizeOverride] = physicalAndOverride(await this.shell("wm size"));
    const [density, densityOverride] = physicalAndOverride(await this.shell("wm density"));
    return {
      image: await this.shell("getprop ro.build.fingerprint"),
      emulator: property(emulatorPackage, "Pkg.Revision"),
      gpu: property(hardware, "hw.gpu.mode"),
      size,
      sizeOverride,
      density,
      densityOverride,
      fontScale: await this.shell("settings get system font_scale"),
      locale: (await this.shell("getprop persist.sys.locale")) || (await this.shell("getprop ro.product.locale")),
      nightMode: (await this.shell("cmd uimode night")).replace("Night mode: ", ""),
      navigationMode: await this.shell("settings get secure navigation_mode"),
      windowAnimationScale: await this.shell("settings get global window_animation_scale"),
      transitionAnimationScale: await this.shell("settings get global transition_animation_scale"),
      animatorDurationScale: await this.shell("settings get global animator_duration_scale"),
      demoMode: await this.shell("settings get global sysui_tuner_demo_on"),
    };
  }

  private adb(...args: string[]): Promise<string> {
    return run("adb", ["-s", this.serial, ...args]);
  }

  private shell(command: string): Promise<string> {
    return this.adb("shell", command);
  }
}

export function matchFingerprint(expected: Partial<Fingerprint>, actual: Fingerprint): void {
  const drifted = Object.entries(expected)
    .filter(([key, value]) => actual[key as keyof Fingerprint] !== value)
    .map(([key, value]) => `${key} ${actual[key as keyof Fingerprint]}, expected ${value}`);
  if (drifted.length > 0) throw new Inconclusive(drifted.join("; "));
}

async function run(command: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)(command, args, { timeout: 60_000 });
    return stdout.trim();
  } catch (error) {
    throw new Inconclusive(`${command} ${args.join(" ")}: ${(error as Error).message.trim()}`);
  }
}

async function until(what: string, probe: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 300_000;
  let failure = "";
  while (Date.now() < deadline) {
    // adbd drops the link while it restarts as root
    try {
      if (await probe()) return;
    } catch (error) {
      failure = `: ${(error as Error).message}`;
    }
    await sleep(1000);
  }
  throw new Inconclusive(`timed out waiting for ${what}${failure}`);
}

function property(text: string, key: string): string {
  const value = new RegExp(`^${key.replaceAll(".", "\\.")}\\s*=\\s*(.*)$`, "m").exec(text)?.[1];
  if (value === undefined) throw new Inconclusive(`${key} missing`);
  return value.trim();
}

function physicalAndOverride(output: string): [string, string] {
  return [/Physical \w+: (\S+)/.exec(output)?.[1] ?? "", /Override \w+: (\S+)/.exec(output)?.[1] ?? "none"];
}
