import assert from "node:assert/strict";
import { test } from "node:test";
import { matchFingerprint, type Fingerprint } from "./device.js";

const pixel6: Fingerprint = {
  image: "google/sdk_gphone64_arm64/emu64a:15/AE3A.240806.043/12960925:userdebug/dev-keys",
  emulator: "37.1.11",
  gpu: "lavapipe",
  size: "1080x2400",
  sizeOverride: "none",
  density: "420",
  densityOverride: "none",
  fontScale: "1.0",
  locale: "en-US",
  nightMode: "no",
  navigationMode: "2",
  windowAnimationScale: "0",
  transitionAnimationScale: "0",
  animatorDurationScale: "0",
  demoMode: "1",
};

test("a drifted setting is named with the value expected", () => {
  assert.throws(() => matchFingerprint(pixel6, { ...pixel6, fontScale: "1.3" }), {
    message: "fontScale 1.3, expected 1.0",
  });
});
