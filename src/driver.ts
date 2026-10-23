import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

  signIn(flow: string): Promise<void> {
    return this.test(flow, `sign in ${flow}`);
  }

  async navigate(screen: Screen): Promise<void> {
    const scratch = await mkdtemp(join(tmpdir(), "twinrun-driver-"));
    try {
      const flow = join(scratch, `${screen.id}.yaml`);
      await writeFile(flow, screenFlow(this.appId, screen));
      await this.test(flow, `screen ${screen.id}`);
    } finally {
      await rm(scratch, { recursive: true });
    }
  }

  private async test(flow: string, what: string): Promise<void> {
    try {
      await promisify(execFile)("maestro", ["--device", this.serial, "test", flow], { timeout: 300_000 });
    } catch (error) {
      const { stdout, message } = error as { stdout?: string; message: string };
      throw new Inconclusive(`${what}: ${/FAILED\n\s*(.+)/.exec(stdout ?? "")?.[1] ?? message.trim()}`);
    }
  }
}

export function screenFlow(appId: string, screen: Screen): string {
  const way = "deepLink" in screen ? { openLink: screen.deepLink } : { runFlow: resolve(screen.flow) };
  return `${stringify({ appId })}---\n${stringify(["stopApp", way, { assertVisible: screen.identity }])}`;
}
