import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { closeSync, openSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Device } from "./device.js";
import { Inconclusive } from "./inconclusive.js";
import { until } from "./until.js";

export interface Miss {
  method: string;
  url: string;
  backend: boolean;
}

const port = 8080;
const replayAddon = fileURLToPath(new URL("../addons/replay.py", import.meta.url));

export class Mock {
  private constructor(
    private readonly device: Device,
    private readonly mitmdump: ChildProcess,
    private readonly exited: Promise<unknown>,
    private readonly scratch: string,
  ) {}

  static async start(device: Device, har: string, backendHosts: string[]): Promise<Mock> {
    const scratch = await mkdtemp(join(tmpdir(), "twinrun-mock-"));
    const log = join(scratch, "mitmdump.log");
    await writeFile(join(scratch, "misses.jsonl"), "");
    const output = openSync(log, "w");
    const mitmdump = spawn(
      "mitmdump",
      [
        ["--listen-host", "127.0.0.1", "-p", String(port)],
        ["--set", "connection_strategy=lazy", "-s", replayAddon, "--set", `har=${har}`],
        ["--set", `misses=${join(scratch, "misses.jsonl")}`],
        backendHosts.flatMap((host) => ["--set", `backend_hosts=${host}`]),
      ].flat(),
      { stdio: ["ignore", output, output], env: { ...process.env, PYTHONUNBUFFERED: "1" } },
    );
    closeSync(output);
    const exited = once(mitmdump, "exit");
    try {
      await until("mitmdump to listen", async () => mitmdump.exitCode !== null || (await readFile(log, "utf8")).includes("proxy listening"), 30);
      if (mitmdump.exitCode !== null) throw new Inconclusive(`mitmdump exited: ${(await readFile(log, "utf8")).trim()}`);
      await device.useProxy(`10.0.2.2:${port}`);
    } catch (error) {
      mitmdump.kill("SIGINT");
      await exited;
      await rm(scratch, { recursive: true });
      throw error;
    }
    return new Mock(device, mitmdump, exited, scratch);
  }

  async stop(): Promise<Miss[]> {
    await this.device.clearProxy();
    this.mitmdump.kill("SIGINT");
    await this.exited;
    const misses = await readFile(join(this.scratch, "misses.jsonl"), "utf8");
    await rm(this.scratch, { recursive: true });
    return misses.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Miss);
  }
}
