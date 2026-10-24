import assert from "node:assert/strict";
import { test } from "node:test";
import { screenFlow } from "./driver.js";

test("a deep link screen opens from a stopped app, asserts its identity, then takes its screenshot", () => {
  const orderDetail = { id: "order_detail", deepLink: "orders://order/1042", identity: { text: "Order number" } };
  assert.equal(
    screenFlow("com.northwind.orders", orderDetail),
    `appId: com.northwind.orders
---
- stopApp
- openLink: orders://order/1042
- assertVisible:
    text: Order number
- takeScreenshot: order_detail
`,
  );
});

test("a selected identity asserts the selected element holding its label", () => {
  const orders = { id: "orders", deepLink: "orders://orders", identity: { text: "Orders", selected: true } };
  assert.match(
    screenFlow("com.northwind.orders", orders),
    /- assertVisible:\n {4}selected: true\n {4}containsDescendants:\n {6}- text: Orders\n/,
  );
});
