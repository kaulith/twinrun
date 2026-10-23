import assert from "node:assert/strict";
import { test } from "node:test";
import { screenFlow } from "./driver.js";

test("a deep link screen opens from a stopped app, then asserts its identity", () => {
  const orderDetail = { id: "order_detail", deepLink: "orders://order/1042", identity: { text: "Order number" } };
  assert.equal(
    screenFlow("com.northwind.orders", orderDetail),
    `appId: com.northwind.orders
---
- stopApp
- openLink: orders://order/1042
- assertVisible:
    text: Order number
`,
  );
});
