import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Config } from "./config.js";
import { Inconclusive } from "./inconclusive.js";

export interface Commits {
  base: string;
  head: string;
}

const apkLimit = 512 * 2 ** 20;
const sizeLimits = { "base.apk": apkLimit, "head.apk": apkLimit, "commits.json": 4096 };

export class Builder {
  constructor(
    private readonly repo: string,
    private readonly build: Config["build"],
    private readonly localFiles: string[],
    private readonly timeoutMinutes: number,
  ) {}

  async apks(commits: Commits, dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
    await this.apk(commits.base, join(dir, "base.apk"));
    await this.apk(commits.head, join(dir, "head.apk"));
    await writeFile(join(dir, "commits.json"), JSON.stringify(commits, null, 2));
  }

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

export async function readBuilds(dir: string): Promise<Commits> {
  for (const [name, limit] of Object.entries(sizeLimits)) {
    const stats = await lstat(join(dir, name)).catch(() => undefined);
    if (!stats?.isFile() || stats.size > limit) throw new Error(`${join(dir, name)}: expected a file of at most ${limit} bytes`);
  }
  const path = join(dir, "commits.json");
  const commits: unknown = await readFile(path, "utf8").then(JSON.parse).catch(() => undefined);
  const shas = typeof commits === "object" && commits !== null ? Object.entries(commits) : [];
  if (shas.map(([side]) => side).sort().join() !== "base,head" || !shas.every(([, sha]) => typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha))) {
    throw new Error(`${path}: expected {"base": <sha>, "head": <sha>}, each 40 hex digits`);
  }
  return commits as Commits;
}
