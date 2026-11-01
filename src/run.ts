import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readBuilds } from "./build.js";
import { compare } from "./compare.js";
import type { Config } from "./config.js";
import { Device } from "./device.js";
import { Driver } from "./driver.js";
import { Mock } from "./mock.js";
import { renderReport, type RunResult, type ScreenResult } from "./report.js";

export interface DriveOptions {
  config: Config;
  serial: string;
  ca: string;
  builds: string;
  out: string;
}

export async function drive({ config, serial, ca, builds, out }: DriveOptions): Promise<RunResult> {
  const commits = await readBuilds(builds);
  const device = new Device(serial);
  const fingerprint = await device.ready(ca);
  const driver = new Driver(serial, config.app.id);
  const capture = async (side: "base" | "head") => {
    const mock = await Mock.start(device, config.backend);
    const screenshots: string[] = [];
    try {
      await device.installClean(config.app.id, join(builds, `${side}.apk`));
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
  const result = { base: { commit: commits.base, misses: before.misses }, head: { commit: commits.head, misses: after.misses }, screens };
  await writeFile(join(out, "result.json"), JSON.stringify(result, null, 2));
  await writeFile(join(out, "report.md"), renderReport(result, (crop) => crop));
  return result;
}
