import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { Inconclusive } from "./inconclusive.js";

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Comparison = { changed: false } | { changed: true; pixels: number; region: Region; crop: Buffer };

const changedColor: [number, number, number] = [255, 0, 0];
const margin = 32;
const gutter = 16;

export function compare(base: Buffer, head: Buffer): Comparison {
  const before = PNG.sync.read(base);
  const after = PNG.sync.read(head);
  const { width, height } = before;
  if (after.width !== width || after.height !== height) {
    throw new Inconclusive(`head screenshot ${after.width}x${after.height}, expected ${width}x${height}`);
  }
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(before.data, after.data, diff.data, width, height, { threshold: 0.1, diffColor: changedColor });
  if (pixels === 0) return { changed: false };
  let [left, top, right, bottom] = [width, height, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (changedColor.every((channel, c) => diff.data[i + c] === channel)) {
        [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
      }
    }
  }
  const x = Math.max(0, left - margin);
  const y = Math.max(0, top - margin);
  const region = { x, y, width: Math.min(width, right + 1 + margin) - x, height: Math.min(height, bottom + 1 + margin) - y };
  const crop = new PNG({ width: region.width * 3 + gutter * 2, height: region.height });
  crop.data.fill(255);
  [before, after, diff].forEach((panel, i) => PNG.bitblt(panel, crop, x, y, region.width, region.height, i * (region.width + gutter), 0));
  return { changed: true, pixels, region, crop: PNG.sync.write(crop) };
}
