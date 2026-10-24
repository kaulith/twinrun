#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { once } from "node:events";
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { parseArgs } from "node:util";
import { compare } from "./compare.js";
import { parseConfig } from "./config.js";
import { Device } from "./device.js";
import { Driver } from "./driver.js";
import { GitHub } from "./github.js";
import { Inconclusive } from "./inconclusive.js";
import { Mock } from "./mock.js";
import { renderReport, type RunResult } from "./report.js";
import { run } from "./run.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const usage = `usage: twinrun --version
       twinrun device ready --serial <serial> --ca <pem>
       twinrun device check --serial <serial> --fingerprint <json>
       twinrun mock --serial <serial> --har <har> --backend-host <host>...
       twinrun capture --serial <serial> --screen <id>... --out <dir>   (from the app repo root)
       twinrun compare --base <png> --head <png> --out <png>
       twinrun run --serial <serial> --ca <pem> --base <commit> --head <commit> --har <har> --out <dir>
                   [--local-file <path>...]   (from the app repo root)
       twinrun comment --out <dir> --repo <owner/name> --pr <number>   (GITHUB_TOKEN in the environment)`;

try {
  const { values, positionals } = parseArgs({
    options: {
      version: { type: "boolean" },
      serial: { type: "string" },
      ca: { type: "string" },
      fingerprint: { type: "string" },
      har: { type: "string" },
      "backend-host": { type: "string", multiple: true },
      screen: { type: "string", multiple: true },
      out: { type: "string" },
      base: { type: "string" },
      head: { type: "string" },
      "local-file": { type: "string", multiple: true },
      repo: { type: "string" },
      pr: { type: "string" },
    },
    allowPositionals: true,
  });
  const command = positionals.join(" ");
  const { serial, ca, fingerprint, har, "backend-host": backendHosts, screen: screenIds, out, base, head, "local-file": localFiles = [], repo, pr } = values;
  if (values.version) {
    console.log(version);
  } else if (command === "device ready" && serial && ca) {
    // a path that is not a certificate is bad input, not an inconclusive device
    new X509Certificate(readFileSync(ca));
    console.log(JSON.stringify(await new Device(serial).ready(ca), null, 2));
  } else if (command === "device check" && serial && fingerprint) {
    console.log(JSON.stringify(await new Device(serial).check(JSON.parse(readFileSync(fingerprint, "utf8"))), null, 2));
  } else if (command === "mock" && serial && har && backendHosts) {
    const mock = await Mock.start(new Device(serial), har, backendHosts);
    console.error("serving the HAR; Ctrl-C stops it and prints the misses");
    await once(process, "SIGINT");
    console.log(JSON.stringify(await mock.stop(), null, 2));
  } else if (command === "capture" && serial && screenIds && out) {
    const config = parseConfig(readFileSync(".github/twinrun.yml", "utf8"));
    const screens = screenIds.map((id) => {
      const screen = config.screens.find((s) => s.id === id);
      if (!screen) throw new Error(`--screen ${id}: not in .github/twinrun.yml`);
      return screen;
    });
    mkdirSync(out, { recursive: true });
    const driver = new Driver(serial, config.app.id);
    if (config.signIn) await driver.signIn(config.signIn);
    const screenshots = [];
    for (const screen of screens) screenshots.push(await driver.capture(screen, out));
    console.log(JSON.stringify(screenshots, null, 2));
  } else if (command === "compare" && base && head && out) {
    const comparison = compare(readFileSync(base), readFileSync(head));
    if (comparison.changed) writeFileSync(out, comparison.crop);
    console.log(JSON.stringify({ ...comparison, crop: comparison.changed ? out : undefined }, null, 2));
  } else if (command === "run" && serial && ca && base && head && har && out) {
    new X509Certificate(readFileSync(ca));
    for (const file of localFiles) {
      if (isAbsolute(file) || normalize(file).startsWith("..") || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`--local-file ${file}: expected a file inside this checkout`);
      }
    }
    const config = parseConfig(readFileSync(".github/twinrun.yml", "utf8"));
    const commits = { base: commit("--base", base), head: commit("--head", head) };
    console.log(JSON.stringify(await run({ repo: process.cwd(), config, localFiles, serial, ca, har, out, ...commits }), null, 2));
  } else if (command === "comment" && out && repo && pr) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`--repo ${repo}: expected owner/name`);
    if (!/^[1-9]\d*$/.test(pr)) throw new Error(`--pr ${pr}: expected a pull request number`);
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN: expected a token in the environment");
    const result = JSON.parse(readFileSync(join(out, "result.json"), "utf8")) as RunResult;
    const github = new GitHub(repo, token);
    const crops = result.screens.flatMap((screen) => (screen.changed ? [screen.crop] : []));
    const urls = await github.uploadCrops(Object.fromEntries(crops.map((crop) => [crop, readFileSync(join(out, crop))])));
    const body = renderReport(result, (crop) => urls[crop]);
    console.log(JSON.stringify({ comment: await github.upsertComment(Number(pr), body) }, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);
  } else {
    throw new Error(usage);
  }
} catch (error) {
  console.error(error instanceof Inconclusive ? `inconclusive: ${error.message}` : (error as Error).message);
  process.exitCode = error instanceof Inconclusive ? 2 : 1;
}

function commit(flag: string, revision: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`], { encoding: "utf8" }).trim();
  } catch {
    throw new Error(`${flag} ${revision}: not a commit in this repository`);
  }
}
