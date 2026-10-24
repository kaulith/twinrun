import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Config } from "./config.js";
import { Inconclusive } from "./inconclusive.js";

export class Builder {
  constructor(
    private readonly repo: string,
    private readonly build: Config["build"],
    private readonly localFiles: string[],
    private readonly timeoutMinutes: number,
  ) {}

  async apk(commit: string, destination: string): Promise<void> {
    const worktree = await mkdtemp(join(tmpdir(), "twinrun-build-"));
    await this.git("worktree", "add", "--detach", worktree, commit);
    try {
      for (const file of this.localFiles) {
        const target = join(worktree, file);
        if (existsSync(target)) throw new Error(`local file ${file}: tracked at ${commit}, expected a file the commit lacks`);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(join(this.repo, file), target);
      }
      const sh = spawn("sh", ["-c", this.build.command], { cwd: worktree, stdio: ["ignore", 2, 2], timeout: this.timeoutMinutes * 60_000 });
      const [code, signal] = (await once(sh, "exit")) as [number | null, NodeJS.Signals | null];
      if (code !== 0) throw new Inconclusive(`build at ${commit}: exit ${code ?? signal}, expected 0`);
      const apk = join(worktree, this.build.apk);
      if (!existsSync(apk)) throw new Error(`build.apk ${this.build.apk}: not found after the build at ${commit}`);
      await copyFile(apk, destination);
    } finally {
      await this.git("worktree", "remove", "--force", worktree);
    }
  }

  private async git(...args: string[]): Promise<void> {
    try {
      await promisify(execFile)("git", ["-C", this.repo, ...args], { timeout: 60_000 });
    } catch (error) {
      throw new Inconclusive(`git ${args.join(" ")}: ${(error as Error).message.trim()}`);
    }
  }
}
