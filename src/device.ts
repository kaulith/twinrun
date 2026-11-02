import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Inconclusive } from "./inconclusive.js";
import { until } from "./until.js";

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
  airplaneMode: string;
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
  airplaneMode: "0",
};

const pinCommands = [
  "cmd connectivity airplane-mode disable",
  "wm size reset",
  "wm density reset",
  "settings put system font_scale 1.0",
  "cmd uimode night no",
  "cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural",
  "settings put global window_animation_scale 0",
  "settings put global transition_animation_scale 0",
  "settings put global animator_duration_scale 0",
];

const demoSettings = ["sysui_demo_allowed", "sysui_tuner_demo_on"];

export const demoClock = "12:00";

const demoReceivers = ["clock", "battery", "network", "notifications"];

const demoCommands = [
  `am broadcast -a com.android.systemui.demo -e command clock -e hhmm ${demoClock.replace(":", "")}`,
  "am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false",
  "am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 -e fully true",
  "am broadcast -a com.android.systemui.demo -e command network -e mobile hide",
  "am broadcast -a com.android.systemui.demo -e command notifications -e visible false",
];

const userCertificates = "/data/misc/user/0/cacerts-added";

export class Device {
  constructor(private readonly serial: string) {}

  async ready(ca: string): Promise<Fingerprint> {
    let refused = false;
    await until("adbd as root", async () => {
      refused = (await this.adb("root")).includes("cannot");
      return refused || (await this.shell("id -u")) === "0";
    });
    if (refused) throw new Inconclusive("adbd cannot run as root; D14 needs a google_apis image");
    await until("boot completed", async () => (await this.shell("getprop sys.boot_completed")) === "1");
    await until("package manager", async () => (await this.shell("pm path android")).startsWith("package:"));
    await until("system error dialogs to clear", async () => {
      const dialog = /Application (?:Not Responding|Error): ([\w.]+)/.exec(await this.shell("dumpsys window windows"));
      if (!dialog) return true;
      if (dialog[1] !== "com.android.systemui") await this.shell(`am force-stop ${dialog[1]}`);
      throw new Error(dialog[0]);
    });
    for (const command of pinCommands) await this.shell(command);
    // on a first boot System UI's tuner turns demo mode off once, some seconds after it starts below version 4
    await this.shell("settings put secure sysui_tuner_version 4");
    await until("System UI to take demo commands", async () => {
      for (const setting of demoSettings) await this.shell(`settings put global ${setting} 1`);
      const missing = demoModeMissing(await this.shell("dumpsys activity service com.android.systemui/.SystemUIService DemoModeController"));
      if (missing.length > 0) throw new Error(`missing ${missing.join(", ")}`);
      return true;
    });
    for (const command of demoCommands) await this.shell(command);
    await this.clearProxy();
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

  async useProxy(address: string): Promise<void> {
    await this.shell(`settings put global http_proxy ${address}`);
    const proxy = await this.shell("settings get global http_proxy");
    if (proxy !== address) throw new Inconclusive(`http_proxy ${proxy}, expected ${address}`);
  }

  clearProxy(): Promise<void> {
    return this.useProxy(":0");
  }

  async installClean(appId: string, apk: string): Promise<void> {
    if (await this.installed(appId)) await this.adb("uninstall", appId);
    await this.adb("install", "-g", apk);
    if (!(await this.installed(appId))) throw new Inconclusive(`${appId} not installed after adb install`);
  }

  private async installed(appId: string): Promise<boolean> {
    return (await this.shell(`pm list packages ${appId}`)).split(/\r?\n/).includes(`package:${appId}`);
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
      airplaneMode: await this.shell("settings get global airplane_mode_on"),
    };
  }

  private adb(...args: string[]): Promise<string> {
    return run("adb", ["-s", this.serial, ...args]);
  }

  private shell(command: string): Promise<string> {
    return this.adb("shell", command);
  }
}

export function demoModeMissing(dump: string): string[] {
  return [
    ...["isInDemoMode=true", "isDemoModeAllowed=true"].filter((state) => !dump.includes(state)),
    ...demoReceivers.filter((command) => !new RegExp(`^\\s*${command} : \\[\\w`, "m").test(dump)).map((command) => `${command} receiver`),
  ];
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

function property(text: string, key: string): string {
  const value = new RegExp(`^${key.replaceAll(".", "\\.")}\\s*=\\s*(.*)$`, "m").exec(text)?.[1];
  if (value === undefined) throw new Inconclusive(`${key} missing`);
  return value.trim();
}

function physicalAndOverride(output: string): [string, string] {
  return [/Physical \w+: (\S+)/.exec(output)?.[1] ?? "", /Override \w+: (\S+)/.exec(output)?.[1] ?? "none"];
}
