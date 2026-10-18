#!/usr/bin/env node
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const [command] = process.argv.slice(2);
if (command === "--version") {
  console.log(version);
} else {
  console.error("usage: twinrun --version");
  process.exitCode = 1;
}
