import assert from "node:assert/strict";
import { test } from "node:test";
import { PNG } from "pngjs";
import { compare } from "./compare.js";

function screenshot(withBadge: boolean): Buffer {
  const png = new PNG({ width: 200, height: 200 });
  png.data.fill(255);
  if (withBadge) {
    for (let y = 100; y < 104; y++) for (let x = 100; x < 104; x++) png.data.set([33, 150, 243, 255], (y * 200 + x) * 4);
  }
  return PNG.sync.write(png);
}

test("a changed area is cut with its margin from base, head and diff, side by side", () => {
  const comparison = compare(screenshot(false), screenshot(true));
  assert.ok(comparison.changed);
  assert.deepEqual(comparison.region, { x: 68, y: 68, width: 68, height: 68 });
  const crop = PNG.sync.read(comparison.crop);
  assert.deepEqual([crop.width, crop.height], [68 * 3 + 16 * 2, 68]);
});
