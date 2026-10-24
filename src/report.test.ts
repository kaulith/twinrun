import assert from "node:assert/strict";
import { test } from "node:test";
import { renderReport } from "./report.js";

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
