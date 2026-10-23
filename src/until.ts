import { setTimeout as sleep } from "node:timers/promises";
import { Inconclusive } from "./inconclusive.js";

export async function until(what: string, probe: () => Promise<boolean>, seconds = 300): Promise<void> {
  const deadline = Date.now() + seconds * 1000;
  let failure = "";
  while (Date.now() < deadline) {
    // a probe can fail until the thing it waits for is up, as adbd does while it restarts as root
    try {
      if (await probe()) return;
    } catch (error) {
      failure = `: ${(error as Error).message}`;
    }
    await sleep(1000);
  }
  throw new Inconclusive(`timed out waiting for ${what}${failure}`);
}
