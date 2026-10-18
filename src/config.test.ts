import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseConfig } from "./config.js";

const dogfood = readFileSync(new URL("../test/fixtures/dogfood.twinrun.yml", import.meta.url), "utf8");

test("reads each screen with its way in and its identity", () => {
  const { screens } = parseConfig(dogfood);
  assert.equal(screens.length, 9);
  assert.deepEqual(screens.find((s) => s.id === "leaderboard"), {
    id: "leaderboard",
    flow: ".github/twinrun/flows/leaderboard.yaml",
    identity: { text: "Ranking", selected: true },
  });
});

test("caps left out of the file take the defaults", () => {
  assert.deepEqual(parseConfig(dogfood).caps, { screens: 8, agentSteps: 40, timeoutMinutes: 20 });
});

test("a bad field fails with its path", () => {
  assert.throws(() => parseConfig(dogfood.replace("text: Site URL", "label: Site URL")), {
    message: "screens[0].identity.label: unknown field",
  });
});
