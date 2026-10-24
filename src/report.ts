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

export function renderReport({ base, head, screens }: RunResult): string {
  const lines = ["# twinrun", "", `Base \`${base.commit}\`, head \`${head.commit}\`.`];
  for (const screen of screens) {
    if (screen.changed) {
      lines.push("", `## ${screen.id}`, "", `Pixel diff: ${screen.pixels} pixels changed. Base, head and diff:`, "", `![${screen.id}](${screen.crop})`);
    }
  }
  const unchanged = screens.filter((screen) => !screen.changed).map((screen) => screen.id);
  if (unchanged.length > 0) lines.push("", "## Unchanged", "", unchanged.join(", "));
  lines.push("", "## Backend misses", "", "Requests the HAR did not answer, by side.", "");
  for (const [name, side] of [["base", base], ["head", head]] as const) {
    const backend = side.misses.filter((miss) => miss.backend);
    lines.push(`- ${name}: ${backend.length} to the backend, ${side.misses.length - backend.length} to other hosts`);
    lines.push(...backend.map((miss) => `  - \`${miss.method} ${miss.url}\``));
  }
  return `${lines.join("\n")}\n`;
}
