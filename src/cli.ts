#!/usr/bin/env node
import { X509Certificate } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Device } from "./device.js";
import { Inconclusive } from "./inconclusive.js";
import { Mock } from "./mock.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const usage = `usage: twinrun --version
       twinrun device ready --serial <serial> --ca <pem>
       twinrun device check --serial <serial> --fingerprint <json>
       twinrun mock --serial <serial> --har <har> --backend-host <host>...`;

try {
  const { values, positionals } = parseArgs({
    options: {
      version: { type: "boolean" },
      serial: { type: "string" },
      ca: { type: "string" },
      fingerprint: { type: "string" },
      har: { type: "string" },
      "backend-host": { type: "string", multiple: true },
    },
    allowPositionals: true,
  });
  const command = positionals.join(" ");
  const { serial, ca, fingerprint, har, "backend-host": backendHosts } = values;
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
  } else {
    throw new Error(usage);
  }
} catch (error) {
  console.error(error instanceof Inconclusive ? `inconclusive: ${error.message}` : (error as Error).message);
  process.exitCode = error instanceof Inconclusive ? 2 : 1;
}
