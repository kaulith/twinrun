import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { stringify } from "yaml";
import type { Screen } from "./config.js";
import { Inconclusive } from "./inconclusive.js";

export class Driver {
  constructor(
    private readonly serial: string,
    private readonly appId: string,
  ) {}

  async signIn(flow: string): Promise<void> {
    const scratch = await mkdtemp(join(tmpdir(), "twinrun-driver-"));
    try {
      await this.test(flow, scratch, `sign in ${flow}`);
    } finally {
      await rm(scratch, { recursive: true });
    }
  }

  async capture(screen: Screen, dir: string): Promise<string> {
    const scratch = await mkdtemp(join(tmpdir(), "twinrun-driver-"));
    try {
      const flow = join(scratch, `${screen.id}.yaml`);
      await writeFile(flow, screenFlow(this.appId, screen));
      await this.test(flow, scratch, `screen ${screen.id}`);
      const taken = (await readdir(scratch, { recursive: true })).find((path) => path.endsWith(join("takeScreenshot", `${screen.id}.png`)));
      if (!taken) throw new Inconclusive(`screen ${screen.id}: no screenshot in Maestro's output`);
      const screenshot = join(dir, `${screen.id}.png`);
      await copyFile(join(scratch, taken), screenshot);
      return screenshot;
    } finally {
      await rm(scratch, { recursive: true });
    }
  }

  private async test(flow: string, scratch: string, what: string): Promise<void> {
    try {
      const outputs = ["--test-output-dir", join(scratch, "output"), "--debug-output", join(scratch, "debug")];
      await promisify(execFile)("maestro", ["--device", this.serial, "test", ...outputs, flow], { timeout: 300_000 });
    } catch (error) {
      const { stdout, message } = error as { stdout?: string; message: string };
      throw new Inconclusive(`${what}: ${/FAILED\n\s*(.+)/.exec(stdout ?? "")?.[1] ?? message.trim()}`);
    }
  }
}

export function screenFlow(appId: string, screen: Screen): string {
  const way = "deepLink" in screen ? { openLink: screen.deepLink } : { runFlow: resolve(screen.flow) };
  const { selected, ...label } = screen.identity;
  const identity = selected ? { selected: true, containsDescendants: [label] } : label;
  return `${stringify({ appId })}---\n${stringify(["stopApp", way, { assertVisible: identity }, { takeScreenshot: screen.id }])}`;
}
