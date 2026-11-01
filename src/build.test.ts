import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Builder, readBuilds } from "./build.js";

test("a local file the commit lacks reaches the build in the commit's worktree", async (t) => {
  const repo = mkdtempSync(join(tmpdir(), "twinrun-test-"));
  t.after(() => rmSync(repo, { recursive: true }));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, "-c", "init.defaultBranch=main", "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  writeFileSync(join(repo, "settings.gradle.kts"), "");
  git("add", ".");
  git("commit", "--quiet", "-m", "app");
  writeFileSync(join(repo, "local.properties"), "sdk.dir=/opt/android-sdk\n");
  const apk = join(repo, "app-debug.apk");
  const builder = new Builder(repo, { command: "cp local.properties app-debug.apk", apk: "app-debug.apk" }, ["local.properties"], 1);
  await builder.apk(git("rev-parse", "HEAD"), apk);
  assert.equal(readFileSync(apk, "utf8"), "sdk.dir=/opt/android-sdk\n");
});

test("builds whose commits.json holds a short SHA fail", async (t) => {
  const builds = mkdtempSync(join(tmpdir(), "twinrun-test-"));
  t.after(() => rmSync(builds, { recursive: true }));
  writeFileSync(join(builds, "base.apk"), "");
  writeFileSync(join(builds, "head.apk"), "");
  writeFileSync(join(builds, "commits.json"), JSON.stringify({ base: "35dcf92", head: "e2163f9d0b1c4a5e6f708192a3b4c5d6e7f80912" }));
  await assert.rejects(readBuilds(builds), { message: `${join(builds, "commits.json")}: expected {"base": <sha>, "head": <sha>}, each 40 hex digits` });
});
