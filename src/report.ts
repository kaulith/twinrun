import type { Miss } from "./mock.js";

export interface Side {
  commit: string;
  misses: Miss[];
}

export type ScreenResult = { id: string; changed: false } | { id: string; changed: true; pixels: number; crop: string };

export interface RunResult {
  base: Side;
  head: Side;
  screens: ScreenResult[];
}

export function renderReport({ base, head, screens }: RunResult, imageUrl: (crop: string) => string): string {
  const lines = ["# twinrun", "", `Base \`${base.commit}\`, head \`${head.commit}\`.`];
  for (const screen of screens) {
    if (screen.changed) {
      lines.push("", `## ${screen.id}`, "", `Pixel diff: ${screen.pixels} pixels changed. Base, head and diff:`, "", `![${screen.id}](${imageUrl(screen.crop)})`);
    }
  }
  const unchanged = screens.filter((screen) => !screen.changed).map((screen) => screen.id);
  if (unchanged.length > 0) lines.push("", "## Unchanged", "", unchanged.join(", "));
  lines.push("", "## Backend misses", "", "Requests the HAR did not answer, by side.", "");
  for (const [name, side] of [["base", base], ["head", head]] as const) {
    const backend = side.misses.filter((miss) => miss.backend);
    lines.push(`- ${name}: ${backend.length} to the backend, ${side.misses.length - backend.length} to other hosts`);
    lines.push(...backend.map((miss) => `  - \`${[miss.method, miss.url].map((part) => part.replace(/[`\s]/g, encodeURIComponent)).join(" ")}\``));
  }
  return `${lines.join("\n")}\n`;
}

export function parseResult(source: string): RunResult {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    fail("", "expected JSON");
  }
  const { base, head, screens } = record(value, "");
  return { base: side(base, "base"), head: side(head, "head"), screens: list(screens, "screens").map((item, i) => screen(item, `screens[${i}]`)) };
}

function side(value: unknown, at: string): Side {
  const { commit, misses } = record(value, at);
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit)) fail(`${at}.commit`, "expected 40 hex digits");
  return {
    commit,
    misses: list(misses, `${at}.misses`).map((item, i) => {
      const { method, url, backend } = record(item, `${at}.misses[${i}]`);
      if (typeof method !== "string" || typeof url !== "string" || typeof backend !== "boolean") fail(`${at}.misses[${i}]`, "expected a method, a url and a backend flag");
      return { method, url, backend };
    }),
  };
}

function screen(value: unknown, at: string): ScreenResult {
  const { id, changed, pixels, crop } = record(value, at);
  if (typeof id !== "string" || !/^[\w-]+$/.test(id)) fail(`${at}.id`, "expected only letters, digits, _ and -");
  if (changed === false && pixels === undefined && crop === undefined) return { id, changed };
  if (changed !== true || typeof pixels !== "number" || !Number.isInteger(pixels) || pixels < 1 || crop !== `crops/${id}.png`) {
    fail(at, `expected changed false alone, or changed true with whole pixels above 0 and crop crops/${id}.png`);
  }
  return { id, changed, pixels, crop };
}

function record(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(at, "expected an object");
  return value as Record<string, unknown>;
}

function list(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) fail(at, "expected a list");
  return value;
}

function fail(at: string, problem: string): never {
  throw new Error(`result.json${at ? ` ${at}` : ""}: ${problem}`);
}
