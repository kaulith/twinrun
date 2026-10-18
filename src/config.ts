import { parse } from "yaml";

export interface Identity {
  text?: string;
  id?: string;
  selected?: boolean;
}

export interface Screen {
  id: string;
  deepLink?: string;
  flow?: string;
  identity: Identity;
}

export interface Config {
  app: { id: string };
  build: { command: string; apk: string };
  backend: { hosts: string[] };
  screens: Screen[];
  caps: { screens: number; agentSteps: number; timeoutMinutes: number };
}

export function parseConfig(source: string): Config {
  const root = mapping(parse(source), "", ["app", "build", "backend", "screens", "caps"]);
  const app = mapping(root.app, "app", ["id"]);
  const build = mapping(root.build, "build", ["command", "apk"]);
  const backend = mapping(root.backend, "backend", ["hosts"]);
  const caps = mapping(root.caps ?? {}, "caps", ["screens", "agentSteps", "timeoutMinutes"]);
  const screens = list(root.screens, "screens").map((value, i) => screen(value, `screens[${i}]`));
  const duplicate = screens.findIndex((s, i) => screens.findIndex((other) => other.id === s.id) !== i);
  if (duplicate >= 0) fail(`screens[${duplicate}].id`, `${screens[duplicate].id} is already used`);
  return {
    app: { id: nonEmpty(app.id, "app.id") },
    build: { command: nonEmpty(build.command, "build.command"), apk: nonEmpty(build.apk, "build.apk") },
    backend: { hosts: list(backend.hosts, "backend.hosts").map((host, i) => nonEmpty(host, `backend.hosts[${i}]`)) },
    screens,
    caps: {
      screens: count(caps.screens ?? 8, "caps.screens"),
      agentSteps: count(caps.agentSteps ?? 40, "caps.agentSteps"),
      timeoutMinutes: count(caps.timeoutMinutes ?? 20, "caps.timeoutMinutes"),
    },
  };
}

function screen(value: unknown, at: string): Screen {
  const fields = mapping(value, at, ["id", "deepLink", "flow", "identity"]);
  if ((fields.deepLink === undefined) === (fields.flow === undefined)) fail(at, "needs exactly one of deepLink and flow");
  const identity = mapping(fields.identity, `${at}.identity`, ["text", "id", "selected"]);
  if ((identity.text === undefined) === (identity.id === undefined)) fail(`${at}.identity`, "needs exactly one of text and id");
  return {
    id: nonEmpty(fields.id, `${at}.id`),
    ...(fields.flow === undefined
      ? { deepLink: nonEmpty(fields.deepLink, `${at}.deepLink`) }
      : { flow: nonEmpty(fields.flow, `${at}.flow`) }),
    identity: {
      ...(identity.id === undefined
        ? { text: nonEmpty(identity.text, `${at}.identity.text`) }
        : { id: nonEmpty(identity.id, `${at}.identity.id`) }),
      ...(identity.selected === undefined ? {} : { selected: flag(identity.selected, `${at}.identity.selected`) }),
    },
  };
}

function mapping(value: unknown, at: string, keys: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(at, "must be a mapping");
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown !== undefined) fail(at ? `${at}.${unknown}` : unknown, "unknown field");
  return value as Record<string, unknown>;
}

function list(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) fail(at, "must be a non-empty list");
  return value;
}

function nonEmpty(value: unknown, at: string): string {
  if (typeof value !== "string" || value === "") fail(at, "must be a non-empty string");
  return value;
}

function count(value: unknown, at: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) fail(at, "must be a whole number above 0");
  return value as number;
}

function flag(value: unknown, at: string): boolean {
  if (typeof value !== "boolean") fail(at, "must be true or false");
  return value;
}

function fail(at: string, problem: string): never {
  throw new Error(`${at || "config"}: ${problem}`);
}
