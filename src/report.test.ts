import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResult, renderReport } from "./report.js";

const sideWithoutMisses = { commit: "3bc40b6", misses: [] };

test("a changed screen shows its crop and an unchanged one is only listed", () => {
  const report = renderReport(
    {
      base: sideWithoutMisses,
      head: sideWithoutMisses,
      screens: [
        { id: "order_detail", changed: true, pixels: 1204, crop: "crops/order_detail.png" },
        { id: "orders", changed: false },
      ],
    },
    (crop) => `https://github.com/northwind/orders-app/blob/9f2c1e7/${crop}?raw=true`,
  );
  assert.match(report, /## order_detail\n\nPixel diff: 1204 pixels changed\. Base, head and diff:\n\n!\[order_detail\]\(https:\/\/github\.com\/northwind\/orders-app\/blob\/9f2c1e7\/crops\/order_detail\.png\?raw=true\)/);
  assert.match(report, /## Unchanged\n\norders\n/);
});

test("backend misses are listed per side and other hosts only counted", () => {
  const head = {
    commit: "3391968",
    misses: [
      { method: "GET", url: "https://api.northwind.example.com/orders/1042/notes", backend: true },
      { method: "POST", url: "https://firebaseinstallations.googleapis.com/v1/projects/northwind/installations", backend: false },
    ],
  };
  const report = renderReport({ base: sideWithoutMisses, head, screens: [{ id: "orders", changed: false }] }, (crop) => crop);
  assert.match(report, /- base: 0 to the backend, 0 to other hosts\n- head: 1 to the backend, 1 to other hosts\n {2}- `GET https:\/\/api\.northwind\.example\.com\/orders\/1042\/notes`\n$/);
});

test("a miss URL with a newline stays inside its code span", () => {
  const head = { commit: "3391968", misses: [{ method: "GET", url: "https://api.northwind.example.com/orders\n# Approved", backend: true }] };
  const report = renderReport({ base: sideWithoutMisses, head, screens: [{ id: "orders", changed: false }] }, (crop) => crop);
  assert.match(report, /- `GET https:\/\/api\.northwind\.example\.com\/orders%0A#%20Approved`\n$/);
});

test("a result whose crop lies outside crops/<id>.png fails", () => {
  const side = { commit: "3bc40b6025b251df96e9ca6c2fa8e2e51f7b2174", misses: [] };
  const result = { base: side, head: side, screens: [{ id: "orders", changed: true, pixels: 1204, crop: "../.github/workflows/orders.png" }] };
  assert.throws(() => parseResult(JSON.stringify(result)), {
    message: "result.json screens[0]: expected changed false alone, or changed true with whole pixels above 0 and crop crops/orders.png",
  });
});
