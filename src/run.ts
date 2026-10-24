import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Builder } from "./build.js";
import { compare } from "./compare.js";
import type { Config } from "./config.js";
import { Device } from "./device.js";
import { Driver } from "./driver.js";
import { Mock } from "./mock.js";
import { renderReport, type RunResult, type ScreenResult } from "./report.js";

export interface RunOptions {
  repo: string;
  config: Config;
  localFiles: string[];
  serial: string;
  ca: string;
  har: string;
  base: string;
  head: string;
  out: string;
}

export async function run({ repo, config, localFiles, serial, ca, har, base, head, out }: RunOptions): Promise<RunResult> {
  const scratch = await mkdtemp(join(tmpdir(), "twinrun-run-"));
  try {
    const builder = new Builder(repo, config.build, localFiles, config.caps.timeoutMinutes);
    await builder.apk(base, join(scratch, "base.apk"));
    await builder.apk(head, join(scratch, "head.apk"));
    const device = new Device(serial);
    const fingerprint = await device.ready(ca);
    const driver = new Driver(serial, config.app.id);
    const capture = async (side: "base" | "head") => {
      const mock = await Mock.start(device, har, config.backend.hosts);
      const screenshots: string[] = [];
      try {
        await device.installClean(config.app.id, join(scratch, `${side}.apk`));
        if (config.signIn) await driver.signIn(config.signIn);
        await mkdir(join(out, side), { recursive: true });
        for (const screen of config.screens) screenshots.push(await driver.capture(screen, join(out, side)));
      } catch (error) {
        await mock.stop();
        throw error;
      }
      const misses = await mock.stop();
      await device.check(fingerprint);
      return { screenshots, misses };
    };
    const before = await capture("base");
    const after = await capture("head");
    const screens: ScreenResult[] = [];
    for (const [i, { id }] of config.screens.entries()) {
      const comparison = compare(await readFile(before.screenshots[i]), await readFile(after.screenshots[i]));
      if (comparison.changed) {
        const crop = join("crops", `${id}.png`);
        await mkdir(join(out, "crops"), { recursive: true });
        await writeFile(join(out, crop), comparison.crop);
        screens.push({ id, changed: true, pixels: comparison.pixels, crop });
      } else {
        screens.push({ id, changed: false });
      }
    }
    const result = { base: { commit: base, misses: before.misses }, head: { commit: head, misses: after.misses }, screens };
    await writeFile(join(out, "report.md"), renderReport(result));
    return result;
  } finally {
    await rm(scratch, { recursive: true });
  }
}
