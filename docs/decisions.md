# Decisions

Taken from the research report (`docs/research/report.md`, 2026-10-18). Change one only when
its reversal condition is met, and record the change as a new decision.

**D1. Driver: Maestro CLI for replay, `maestro mcp` for the agent.** Apache-2.0, most mature,
crash/ANR bundle per flow, and the agent's steps are already the replay format.
Reverse if: Maestro drops Android emulator support or changes license; then agent-device.

**D2. Replay format: Maestro YAML, one flow per screen id, ending in a landing assertion.**
agent-device already exports it and Arbigent consumes it.
Reverse if: a second driver adapter cannot express a needed action in it.

**D3. Agent explores base once; head replays the frozen script without the LLM.** Divergence on
head is a finding, never healed silently. Removes agent noise from the comparison and halves cost.
Reverse if: replay divergence turns out to be mostly harness noise rather than real change.

**D4. Mock: mitmproxy with a HAR 1.2 fixture store and a replay addon, fail-closed 404.**
Ordered replay, matching knobs, Python addon hook; HAR keeps fixtures engine-neutral.
Reverse if: mitmproxy's license is not permissive, or TLS interception fails on target images.

**D5. CA trust: debug-only `network_security_config` `debug-overrides` by default; root CA
injection opt-in.** Works on stock images and leaves release builds untouched.
Reverse if: Android 17 Certificate Transparency rejects the mock CA under debug-overrides.

**D6. Device: `ubuntu-latest` x64, API 35 `google_apis`, Pixel 6, pinned emulator, cold boot,
no AVD cache.** Measured 25.5 s cold boot; the AVD cache was slower and got rejected.
Not ATD (no SystemUI). Reverse if: API 36+ boots reliably, or a cache keyed on emulator version
beats cold boot.

**D7. Diff: odiff (threshold 0.1, antialiasing) plus a view-hierarchy diff that labels regions;
optional VLM caption only.** Deterministic gate first.
Reverse if: measured false positives on pinned emulators stay high after demo mode.

**D8. Baseline: merge base built and captured in the same job, same emulator, same fixtures
(head's set).** No goldens in the repo.
Reverse if: building twice pushes the job past its 20 minute cap on typical apps.

**D9. PR surface: one sticky comment found by a hidden marker, plus job summary and artifacts;
images on an orphan `pr-device-assets` branch, S3/R2 or artifacts.** Never a failing check.
GitHub App check runs come in v2.

**D10. Selection: diff classifier, screen registry from nav routes and the manifest, ClassGraph
reverse-reference graph (2 hops, broad cap 8), LLM adjudicates candidates only, fixture scenario
per screen.** Smoke set on global changes; label `pr-device: all`; weekly full run on main
measures recall. Reverse if: measured recall stays below the smoke set's.

**D11. Stack: TypeScript on Node 22 orchestrator; Kotlin/JVM analyzer jar on ClassGraph; Python
mitmproxy addon.** Each follows the library it wraps.

**D12. Caps: 8 screens, 40 agent steps per side, `timeout-minutes: 20`, `cancel-in-progress`.**
Predictable cost.

**D13. The replay addon owns matching and the miss path; mitmproxy's built-in server replay is
not the fail-closed layer.** S1 (2026-10-18): built-in replay forwards upstream once its store
drains (`serverplayback.py` checks `if self.flowmap` before `server_replay_extra`), and
consume-once matching missed a duplicate idempotent GET the recording never made, which broke
the dashboard. The addon answers every request: recordings in order, then the last one again;
anything unmatched gets 404 and a miss line; misses are split by declared backend hosts vs the
rest. S1 passed with reuse; ordered-then-last is untested.
Reverse if: upstream server replay gains a fail-closed mode and ordered-then-last reuse.

**D14. CA seeding: `adb root` push into the user store
(`/data/misc/user/0/cacerts-added/<subject_hash_old>.0`) on `google_apis` images, trusted by the
D5 `debug-overrides` config.** API 30+ has no scripted user CA install; the root push worked on
API 35 in S1. This makes D6's `google_apis` (not `google_apis_playstore`, which refuses
`adb root`) load-bearing. Fallback for images without root: bake the run's CA into the debug
build as `@raw` under `debug-overrides`.
Reverse if: a target image refuses `adb root`, or `debug-overrides` stops reading the user store.
