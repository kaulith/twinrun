# Visual review, screenshot diffing and PR reporting for a mobile PR device testing tool

Research date: 2026-10-18. Scope: capturing base vs head screens, diffing, baselines, review/approval, PR presentation. Native Android first, iOS second. Facts are from primary sources (repos, vendor docs, GitHub docs) unless flagged. Repo metadata was pulled with `gh api` on 2026-10-18.

## 1. Mobile tools: what each does and where it stops

### Takeaway
Android/iOS snapshot libraries (Paparazzi, Roborazzi, Compose Preview Screenshot Testing, Shot, swift-snapshot-testing) are component/preview level, keep goldens in the repo and stop at a local HTML report; none drives a real app on base and head or posts a PR review. The only whole-app, PR-scoped, diff-aware tool found is Screenmap (MIT, Expo/React Native/NativeScript only, v1.1.0 on 2026-10-04). arun279/cue is not a tool: it is an app repo (TV tracker) with a bespoke device CI that produces before/after/diff panels per changed screen. Emerge Snapshots lives on as Sentry Snapshots (beta, bring-your-own images, GitHub only).

### Cited Findings

**Screenmap (aleqsio/screenmap)**
- GitHub Action that maps every screen of an Expo/React Native app and comments on PRs with screenshots of screens the change touched; README also says NativeScript; MIT; created 2026-08-08, 245 stars, latest release v1.1.0 on 2026-10-04 — [screenmap.dev](https://screenmap.dev); [repo README](https://github.com/aleqsio/screenmap)
- "Suspects" = screens a PR diff can reach, "worked out from the router and the changed files"; only suspects are re-captured; `effort` input sets how far suspect marking follows imports (1, 2 or 3 hops) — [README](https://github.com/aleqsio/screenmap)
- Baseline = full `.scrmap` map of the default branch, cached on a `screenmaps` branch in the user's repo, built once and refreshed incrementally on every push; a PR run captures only the head side of suspect screens because base-side screenshots already exist in the baseline — [README](https://github.com/aleqsio/screenmap)
- Private repos: `publish: "false"` keeps bundles as run artifacts instead of on the branch — [screenmap.dev](https://screenmap.dev)
- Sticky PR comment shows the changed region of each affected screen plus a link into the hosted viewer at app.screenmap.dev preloaded with baseline map + changes overlay (`?map=…&changes=…`) — [README](https://github.com/aleqsio/screenmap)
- Diff UX: "changed areas get a box, moved areas get an arrow from where they used to be, and the rest of the screen stays quiet"; screens labeled new/changed/removed/unaffected — [README](https://github.com/aleqsio/screenmap); [screenmap.dev](https://screenmap.dev)
- "It reports, it does not gate. There is no pass/fail check by default"; it "posts a comment and nothing else" — [README](https://github.com/aleqsio/screenmap); [screenmap.dev](https://screenmap.dev)
- Two lanes: deterministic (deep links, committed flow replays, diffing, packing) and an optional agent lane (Claude Code default) only for screens with no recorded flow, capped by a per-run budget; agent writes a one-line note per changed screen and can mark a suspect as unaffected; after merge, the baseline job records flows for new screens and opens a flows PR so they replay for free later — [README](https://github.com/aleqsio/screenmap)
- Known blind spot stated by the author: "Nothing verifies that a deep link landed on the screen you meant, so a route that starts needing a param will quietly capture its own not-found state" (the agent is told to check) — [README](https://github.com/aleqsio/screenmap)
- Costs: free, you pay CI minutes and agent tokens; iOS needs macOS at ~10x Linux rate; a JS-only PR takes about 12 minutes end to end — [screenmap.dev](https://screenmap.dev); [README](https://github.com/aleqsio/screenmap)

**arun279/cue**
- Repo is "a personal, zero-backend TV and movie tracker"; MIT; 0 stars; created 2026-07-11 — [repo](https://github.com/arun279/cue)
- Its device screenshot pipeline lives on branch `feat/expo-native` (PRs #124 to #128 target it; main still describes a Capacitor app): `scripts/compare-screenshots.mjs`, `gather-pr-media.sh`, `attach-pr-media.sh`, `render-stability.yml`, `repeat-device-lanes.yml`, `test/ci/no-flake-masks.test.ts` — [PR #124](https://github.com/arun279/cue/pull/124); [branch tree](https://github.com/arun279/cue/tree/feat/expo-native)
- Media review panel per changed screen = three images side by side: clean before, clean after, separate image highlighting what changed (replaced an earlier design that tinted the after screen magenta with ghosted old positions, which "hid what the screen really looks like") — [PR #124](https://github.com/arun279/cue/pull/124)
- Baseline = screenshots from the CI `push` run of the base SHA (looked up via `actions/workflows/ci.yml/runs?head_sha=$base_sha&event=push`); if missing, the review says captures "are missing because no push run of CI exists for base" — [gather-pr-media.sh](https://github.com/arun279/cue/blob/feat/expo-native/scripts/gather-pr-media.sh)
- Diff = pixelmatch, `THRESHOLD = 0.1`, per-device masks (`"iOS 1206": { top: 162, right: 18, glassEdge: [2373, 2385], glassThreshold: 0.3 }`, `"Android 1440": { top: 158, right: 14 }`); masking is done by copying base pixels into the head image for masked rows; throws if no mask exists for a device width — [compare-screenshots.mjs](https://github.com/arun279/cue/blob/feat/expo-native/scripts/compare-screenshots.mjs)
- Review markdown carries `Verdict: VERDICT_PENDING` placeholders; the local `attach-pr-media.sh` refuses to post until every placeholder is replaced, refuses if the PR head moved, uploads images through `uploads.github.com/user-attachments/assets` ("gh pr review has no --attach, so upload through the endpoint gh's --attach uses") and posts a PR review comment — [attach-pr-media.sh](https://github.com/arun279/cue/blob/feat/expo-native/scripts/attach-pr-media.sh)
- A separate "diff footprint" PR comment is deleted and recreated each run rather than edited, because "GitHub keeps a comment's displayed timestamp at creation time forever" — [ci.yml](https://github.com/arun279/cue/blob/main/.github/workflows/ci.yml)

**Roborazzi (takahirom/roborazzi)**
- Apache-2.0; JVM screenshots via Robolectric Native Graphics (Robolectric ≥ 4.10-alpha-1, `@GraphicsMode(NATIVE)`); tasks `record/compare/verify/verifyAndRecord/clearRoborazziDebug` — [README](https://github.com/takahirom/roborazzi)
- Goldens default to `build/outputs/roborazzi`, configurable (e.g. `src/screenshots`); compare writes `*_compare.png` + JSON; HTML report `build/reports/roborazzi/index.html` — [README](https://github.com/takahirom/roborazzi)
- Diff knobs: `changeThreshold` (fraction of differing pixels, example 0.01), `SimpleImageComparator(maxDistance, vShift, hShift)` for anti-aliasing shifts — [README](https://github.com/takahirom/roborazzi)
- Documented CI pattern: record on main and upload artifact; PR job downloads main's artifact and runs `verifyRoborazziDebug`, uploading diffs with `if: always()` — [README](https://github.com/takahirom/roborazzi)
- Experimental AI assertions (`roborazzi-ai-gemini`, `roborazzi-ai-openai`, pluggable `AiAssertionModel` incl. local LLMs) that run "only when the images are different" — [README](https://github.com/takahirom/roborazzi)
- iOS (`roborazzi-compose-ios` ≥ 1.13.0) and Desktop are experimental; recommends `robolectric.pixelCopyRenderMode = "hardware"` for accuracy — [README](https://github.com/takahirom/roborazzi)
- Community fork-safe comment pattern: compare workflow uploads output + a PR-number artifact; a `workflow_run` workflow with `actions: read`, `pull-requests: write` posts the comment (Japanese write-up, unverified against Roborazzi docs) — [Qiita](https://qiita.com/dao0203/items/afebaeb10af0219e29a0)

**Paparazzi (cashapp/paparazzi)**
- Apache-2.0; "render your application screens without a physical device or emulator"; `recordPaparazziDebug` / `verifyPaparazziDebug`; goldens in `src/test/snapshots`, Git LFS recommended; failures in `build/paparazzi/failures`; HTML report — [README](https://github.com/cashapp/paparazzi); [docs](https://cashapp.github.io/paparazzi/)
- Version shown in docs: `2.0.0-alpha05.1`; caveats: Lottie executor workaround, `LocalInspectionMode` not set globally, overrides `View.isInEditMode` — [docs](https://cashapp.github.io/paparazzi/)

**Compose Preview Screenshot Testing (Google, `com.android.compose.screenshot`)**
- Turns `@PreviewTest` previews into host-side screenshot tests; plugin `0.0.1-alpha16`; AGP ≥ 8.5 (Gradle only) / 9.0 (IDE); still alpha; page updated 2026-09-25 — [Android docs](https://developer.android.com/studio/preview/compose-screenshot-testing)
- Standalone plugin is deprecated from AGP 9.5.0-alpha03 in favour of AGP test suites — [Android docs](https://developer.android.com/studio/preview/compose-screenshot-testing)
- Tasks `updateDebugScreenshotTest` / `validateDebugScreenshotTest`; references in `{module}/src/screenshotTest{Variant}/reference`, named by FQN + parameter hash (renaming a test orphans its reference); HTML report; IDE shows Reference/Actual/Diff plus match percentage; Android only, not KMP — [Android docs](https://developer.android.com/studio/preview/compose-screenshot-testing)

**Shot (pedrovgs/Shot)**
- Apache-2.0; instrumentation tests on emulator/device; `executeScreenshotTests -Precord`; goldens in repo; `tolerance = 0.1` (0.1%); recommends `swiftshader_indirect` for Compose; sharding requires same OS, resolution, density; 1.2k stars; no recent release visible — [README](https://github.com/pedrovgs/Shot)

**swift-snapshot-testing (pointfreeco)**
- MIT; strategies `.image`, `.recursiveDescription`, `.dump`, `.json`, `.plist`; references in `__Snapshots__` beside tests; record modes `.all`/`.failed`; "Snapshots must be compared using the exact same simulator that originally took the reference" — [README](https://github.com/pointfreeco/swift-snapshot-testing)

**Showkase (airbnb)**
- Apache-2.0; component browser for Compose; v1.0.5; repo has `showkase-screenshot-testing` and `-paparazzi` modules but README still lists "Hooks for screenshot testing" as coming soon (status unclear) — [README](https://github.com/airbnb/Showkase)

**reg-suit (reg-viz)**
- MIT, 1.3k stars; CLI that compares current images with previous ones; S3/GCS publisher plugins store snapshots; `reg-keygen-git-hash-plugin` finds the commit to compare against from the branch graph; GitHub notifier posts commit status + PR comment via app; Slack notifier — [README](https://github.com/reg-viz/reg-suit)
- Diff engine x-img-diff-js ("more structural information than naive pixel based comparison"); thresholds `thresholdRate`, `thresholdPixel`, `matchingThreshold` (YUV distance), `enableAntialias` — [README](https://github.com/reg-viz/reg-suit)

**Emerge Tools Snapshots / Sentry Snapshots**
- Sentry acquired Emerge Tools; announced 2025-05-06; "for current users, our tools will continue to work exactly as you'd expect" — [Emerge blog](https://emergetools.com/blog/posts/emerge-tools-is-joining-sentry)
- Emerge Snapshots: generated from existing Xcode/Android Studio previews on Emerge-managed simulators/emulators; stored outside the repo per commit SHA; "Emerge treats the base commit for every pull request as the 'golden' set"; merging makes the branch's snapshots the new golden set (doc dated 2025-02-17) — [Emerge docs](https://docs.emergetools.com/docs/snapshot-testing)
- Sentry Snapshots beta announced 2026-06-11: "we first built Snapshots at Emerge Tools", now extended to any platform; PR comment with counts (e.g. 52 modified, 338 unchanged); wipe, onion and split views; approve in UI — [Sentry blog](https://blog.sentry.io/snapshots-available-beta)
- Docs: bring-your-own images (Playwright, Paparazzi, "any tool that outputs images"), uploaded with `sentry-cli snapshots upload` (≥ 3.5.0); base "determined via git metadata" so no golden images to manage; GitHub status check + PR comments, GitHub only; approve from the PR or Sentry UI; `sentry-cli snapshots download` for local baselines; MCP server for agents to inspect diffs — [Sentry docs](https://docs.sentry.io/product/snapshots/)
- Conflict: Sentry docs page says "Beta"; an earlier changelog/KMP guide says Early Adopter / early access — [docs](https://docs.sentry.io/product/snapshots/); [changelog](https://sentry.io/changelog/snapshots-is-now-available-in-early-access); [KMP guide](https://docs.sentry.io/platforms/kotlin/guides/kotlin-multiplatform/snapshots/)

**Commercial native-mobile visual products**
- BrowserStack App Percy: Appium, Maestro, Espresso/XCUITest SDKs; masks status and nav bars by default (120 px Android, 100 px iOS) overridable with `PERCY_STATUS_BAR_HEIGHT` / `PERCY_NAV_BAR_HEIGHT`; Appium ignore regions by XPath, accessibility id, element or coordinates (`@percy/cli` ≥ 1.23.0) — [App Percy Maestro docs](https://www.browserstack.com/docs/app-percy/integrate/maestro); [Appium docs](https://www.browserstack.com/docs/app-percy/appium/getting-started/java/integrate-your-tests)
- Chromatic React Native visual testing (sneak peek/beta): hosted iOS Simulator on macOS and Android Emulator on Linux, "stabilization algorithm", tests from React Native Storybook; launch date not found — [Chromatic blog mirror](https://10x.chromatic.com/blog/react-native-visual-testing-sneak-peek/)

### Inferences
- Gap the planned tool fills: libraries stop at "goldens in repo + local HTML report"; services stop at "upload images you produced". Only Screenmap (RN only) and cue's bespoke pipeline do the whole loop of choosing affected screens, driving a real app on a device and posting before/after per screen. A native Android/iOS equivalent does not appear to exist as open source.
- Preview-based tools (Paparazzi, Roborazzi, CPST, Emerge) render components in isolation, so they cannot see navigation, real data flow, insets/cutouts or system UI. That is a reason to drive the real app, and also the source of most noise the planned tool must absorb.
- Sentry Snapshots and Argos accept arbitrary uploaded images, so the planned tool could offer an optional "upload to Sentry/Argos" sink instead of building its own hosted review page.

### Gaps
- Screenmap's fork-PR security model and exact suspect algorithm were not documented beyond "router + changed files + import hops".
- Latest release numbers/dates for Roborazzi, Shot, swift-snapshot-testing and Showkase were not shown on the fetched pages.
- No primary source found for a date or sunset of the standalone Emerge snapshots product; Emerge Android GitHub Actions doc body did not load.
- Chromatic React Native launch date and GA status not confirmed from a primary page.

## 2. Web visual review mechanics worth porting (Chromatic, Percy, Argos, Lost Pixel, Happo, Applitools)

### Takeaway
The mechanics that transfer to device screenshots are: merge-base baseline selection with "approved builds only", auto-approve on the default branch, per-branch baselines that survive squash/rebase, dependency-graph change detection (TurboSnap), threaded per-snapshot comments and a required "review" status, and region semantics (ignore, floating, layout). Pricing anchors: free tiers are ~5,000 snapshots/month everywhere.

### Cited Findings

**Chromatic**
- TurboSnap uses Git history + the Webpack/Vite dependency graph to re-capture only affected stories; diff is against the ancestor build's commit, union across multiple ancestors; unaffected snapshots are copied ("turbosnaps"); denied tests are always recaptured — [TurboSnap docs](https://www.chromatic.com/docs/turbosnap/)
- Full-rebuild triggers: `package.json` changes without valid lockfile, Storybook config, files imported by `preview.js`, static dir, `--externals`, `--force-rebuild`, infra/browser upgrades; any edit in the graph blocks bypass even a comment-only change — [TurboSnap docs](https://www.chromatic.com/docs/turbosnap/)
- Billing: captured = 1, copied = 0.2, bypassed = 0; example 50 stories with 10 affected = 18 billed — [TurboSnap docs](https://www.chromatic.com/docs/turbosnap/)
- Baselines per branch; new branch inherits from branch point; ancestor build = most recent ancestor commit with a build; unaccepted changes are ignored; merges use "the most recent approved change"; rebases keep accepted baselines from the branch's latest build; squash/rebase merges detected via the GitHub App; `autoAcceptChanges: "main"` — [Branching and baselines](https://www.chromatic.com/docs/branching-and-baselines/)
- UI Review (PR check) does not use baselines; it compares head to the base branch at the merge base and needs a base build, else `--patch-build=$head...$base` — [Branching and baselines](https://www.chromatic.com/docs/branching-and-baselines/)
- Review UX: side-by-side changeset, neon-green diff toggle, threaded discussions attached to a snapshot, default reviewers who must all approve, component owners, "UI Review" status check reflecting a checklist (changeset approved, discussions resolved, reviewers approved); self-approval cannot be prevented — [Review docs](https://www.chromatic.com/docs/review/)
- Pricing: Free $0 5,000 snapshots; Starter $179 35,000 ($0.008 overage); Pro $399 85,000; Enterprise custom — [Pricing](https://www.chromatic.com/pricing)

**Percy (BrowserStack)**
- PR builds: baseline = latest build on the PR target branch; approval-required branches use most recent approved build; without approval-required branch it compares against the previous build; if merge-base build expired under retention it moves to the next eligible build — [Percy base build tutorial](https://www.browserstack.com/docs/percy/visual-testing-workflows/baseline-management/base-build-tutorial-for-git); [App Percy git baselines](https://www.browserstack.com/docs/app-percy/baseline-management/git)

**Argos CI**
- MIT repo (641 stars), "open source visual testing platform"; integrations Playwright, Cypress, Puppeteer, Storybook, Vitest, WebdriverIO — [repo](https://github.com/argos-ci/argos)
- Baseline = most recent build that is complete, passed, not a subset, not rejected, approved, same name/mode, and whose commit is an ancestor of the merge base; auto-approved branch patterns (default branch by default); override with `ARGOS_REFERENCE_BRANCH` / `ARGOS_REFERENCE_COMMIT`; "orphan build" when no baseline; baseline-eligibility chip on each build — [Baseline docs](https://argos-ci.com/docs/baseline-build)
- Pricing: Hobby free 5,000 screenshots/month; Pro $100/month 35,000, $0.004 overage; FAQ "Yes, Argos can be used for mobile app testing" if you send screenshots; open-source projects' screenshots are public — [Pricing](https://argos-ci.com/pricing)

**Lost Pixel**
- MIT; OSS mode (`generateOnly: true`, `failOnDifference: true`) vs Platform mode; approval flow and review UI were platform-only; `customShots` mode accepts any directory of screenshots; repo "archived by the owner on Apr 22, 2026" with "We are sunsetting the product" — [repo](https://github.com/lost-pixel/lost-pixel)

**Happo**
- CLI finds a baseline report starting at the PR merge base, builds HEAD's report, compares; `--beforeSha`/`--afterSha` for unknown CI; GitHub App posts a status (failure on diff, success otherwise); Accept on comparison page flips the status; `--githubToken` posts a PR comment instead — [Happo CI docs](https://docs.happo.io/docs/continuous-integration)
- Pricing: Free 5,000 (pauses at limit), Starter $149/50,000, Growth $399/150,000, Pro $749/300,000, $0.006 overage; native iOS/Android "through the Happo API and a custom integration"; OSS free on request — [Pricing](https://happo.io/pricing)

**Applitools**
- Match levels: Strict (ignores invisible rendering differences), Layout (ignores content/colour, flags appear/disappear/move), Ignore colors, Dynamic (pattern-aware text like dates; Web only), Exact (pixel-to-pixel) — [Match levels](https://applitools.com/docs/common/cmn-eyes-match-levels.html)
- Regions: match-level regions per area (element-based recommended), dynamic text regions, ignore regions ("last resort"), floating regions (element may move within bounds) — [Match levels](https://applitools.com/docs/common/cmn-eyes-match-levels.html)

### Inferences
- Merge-base + "approved only" + auto-approve default branch (Argos/Chromatic/Percy) maps directly to mobile; the eligibility chip idea ("why was this baseline chosen") is cheap and kills a common confusion.
- TurboSnap's dependency-graph approach maps to "which screens does the diff reach": Android needs a graph from source file to Activity/Fragment/Composable destination (nav graph, Compose NavHost routes, manifest). Port TurboSnap's conservative escape hatches (full recapture on Gradle/version catalog, theme, `res/values`, manifest, shared design-system module changes).
- Applitools' Layout level and floating regions are the most transferable concepts for emulator noise: a view-hierarchy-based "layout match" (same nodes, same bounds within tolerance) can be computed from uiautomator/Maestro hierarchy dumps without proprietary AI.
- Chromatic's UI Tests vs UI Review split fits an advisory tool: "unexpected change" (no source change reaches that screen yet pixels moved = likely flake or regression) vs "expected change" (reachable screen changed = for human review).

### Gaps
- Chromatic diff viewer modes (strobe, focus) and batch accept were not on the fetched page.
- Percy's full decision order for base selection is not on one page.
- Argos self-hosting support is not stated on the repo page (Dockerfile and docker-compose present).

## 3. Diffing approaches and emulator/simulator flakiness

### Takeaway
Practical stack: pixel/perceptual diff (pixelmatch or odiff) with anti-aliasing detection and per-device masks, cluster changed pixels into boxed regions, then optionally a VLM to caption/classify only flagged screens. Most noise is environmental (system UI, cutouts, clocks, content readiness, GPU/software rendering), and the cue repo shows it must be pinned and asserted before capture, not just masked after.

### Cited Findings

**Pixel / perceptual engines**
- pixelmatch: ISC; now compares colours in OKLab with HyAB distance; anti-aliasing detector (Vyšniauskas 2009); `threshold` default 0.1, `includeAA` false, `diffMask`; returns mismatched pixel count; `windowSize: N` returns the highest count in any N×N window — [pixelmatch](https://github.com/mapbox/pixelmatch)
- odiff: MIT, written in Zig with SIMD (SSE2/AVX2/AVX512/NEON); own benchmark 1.168 s vs pixelmatch 7.712 s on a full page, 1.951 s vs 10.614 s on 8K; `antialiasing`, `threshold`, `ignoreRegions` rectangles, `diffCount`/`diffPercentage`, `captureDiffLines`, `failOnLayoutDiff` for size changes, Node `odiff-bin` with persistent `ODiffServer` — [odiff](https://github.com/dmtrKovalenko/odiff)
- Roborazzi `changeThreshold` + `maxDistance/vShift/hShift`; Shot `tolerance` percent; reg-suit `thresholdRate`/`thresholdPixel`/`matchingThreshold`/`enableAntialias` — [Roborazzi](https://github.com/takahirom/roborazzi); [Shot](https://github.com/pedrovgs/Shot); [reg-suit](https://github.com/reg-viz/reg-suit)
- Structural alternative: reg-suit's x-img-diff-js computes structural info beyond pixels — [reg-suit](https://github.com/reg-viz/reg-suit)

**Hierarchy / accessibility instead of pixels**
- swift-snapshot-testing `.recursiveDescription` / `.dump` snapshot a view tree or any value as text — [README](https://github.com/pointfreeco/swift-snapshot-testing)
- Cash App AccessibilitySnapshot: image with accessibility elements highlighted plus an ordered list of what VoiceOver reads; fails on accessibility regression — [Cash App blog](https://code.cash.app/making-ios-accessibility-testing-easy)
- cue derives mask coordinates from the Maestro view hierarchy (tab bar glass at 791 pt, items at 795 pt) — [PR #126](https://github.com/arun279/cue/pull/126)

**LLM / VLM judgement**
- Roborazzi AI assertions run only when images differ (Gemini/OpenAI/pluggable) — [Roborazzi](https://github.com/takahirom/roborazzi)
- Screenmap's agent writes a note per changed screen and can mark a suspect unaffected — [Screenmap](https://github.com/aleqsio/screenmap)
- LLMShot (ICSME 2025): Gemma3 12B >84% recall on root-cause classification of snapshot failures from an iOS app; 4B "more practical for CI"; prompting-based selective ignore "showed significant limitations" — [arXiv 2507.10062](https://arxiv.org/abs/2507.10062)
- WUICC-bench (2026-07-02): pixel comparison treats "rendering noise and genuine defects identically"; industry ML VRT tools "lack public evaluation"; captioning methods struggle on dense text and fine-grained changes — [arXiv 2607.01728](https://arxiv.org/abs/2607.01728)
- Practitioner claim (NTD2026 talk, unverified): pixel diffs deterministic and cheap, LLM review contextual but non-deterministic and per-call cost; hybrid recommended — [slides](https://hosted-files.sched.co/ntd2026/0e/Risko%20Ruus%20-%20Lessons%20Learned%20from%20AI-Powered%20Visual%20Reasoning%20Feedback%20%28repaired%29.pptx.pdf)

**Flakiness sources and neutralisers (Android first)**
- SystemUI demo mode: `adb shell settings put global sysui_demo_allowed 1`, then broadcasts to `com.android.systemui.demo` (`enter`, `clock -e hhmm 1231`, `battery -e level 100 -e plugged false`, `network -e wifi show -e level 4`, `notifications -e visible false`, `bars -e mode …`) — [AOSP demo_mode.md](https://android.googlesource.com/platform/frameworks/base/+/master/packages/SystemUI/docs/demo_mode.md)
- android-emulator-runner: enable KVM on ubuntu runners (2-3x faster than macOS); `disable-animations` default true; default `-no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim`; documents AVD snapshot caching — [android-emulator-runner](https://github.com/ReactiveCircus/android-emulator-runner)
- Cached AVD snapshots caused drift: snapshot saved ~0.1 s after boot before the display cutout applied, so status bar 31 px shorter, content 30 px higher, nav buttons moved, and "the pr-media comparison flags every Android screen"; warm start 62 s (29 s restoring 2.26 GB) vs cold boot 56 s; fix = cold boot, enable Pixel 7 Pro emulation overlays, poll `dumpsys window displays` + `navigation_mode` up to 30 s and fail with `Emulator display drifted: <value>` — [cue PR #125](https://github.com/arun279/cue/pull/125)
- Clock skew between app and fake backend broke device runs as days passed; fix = test-build clock starting at the fixture instant (`EXPO_PUBLIC_CLOCK_START`), CI test asserts it equals server `FIXTURE_NOW`, stripped from store bundles — [cue PR #124](https://github.com/arun279/cue/pull/124)
- Content readiness: captures taken before header avatar / more-actions button loaded; fix = per-screen readiness waits plus a test that fails any capture without its wait — [cue PR #128](https://github.com/arun279/cue/pull/128)
- iOS: Liquid-glass tab bar edge refracts content differently per capture (max delta 0.11 vs 0.5 for a real icon change), masked rows 2373–2384 with a looser threshold; scroll indicators fade on their own clocks; lost synthesized taps in the simulator input stack; `apsd` reconnect loop wrote 55–57% of simulator log lines and stalled the sim, disabled via launchd disabled store (simslim/yeetd approach) — [compare-screenshots.mjs](https://github.com/arun279/cue/blob/feat/expo-native/scripts/compare-screenshots.mjs); [PR #126](https://github.com/arun279/cue/pull/126); [PR #128](https://github.com/arun279/cue/pull/128)
- cue forbids retries and flake masks via a test ("keeps both test runners from retrying a failed test") — [no-flake-masks.test.ts](https://github.com/arun279/cue/blob/feat/expo-native/test/ci/no-flake-masks.test.ts)
- Other reported sources: emoji rendering differs across API levels (pin emulator image); images not loaded; fonts/animations/lazy loading/dynamic data; GPU text rendering differences — [proandroiddev](https://proandroiddev.com/why-and-how-i-was-creating-internal-screenshot-testing-library-for-android-ca593c71b6ed); [Argos blog](https://argos-ci.com/blog/fix-flaky-visual-tests)
- Gojek moved from CI emulators to Firebase Test Lab real devices citing startup timing hacks and memory pressure — [Gojek blog](https://blog.gojek.io/screenshot-testing-our-design-system-on-android/)
- Shot recommends `swiftshader_indirect` for Compose; swift-snapshot-testing requires the exact same simulator — [Shot](https://github.com/pedrovgs/Shot); [swift-snapshot-testing](https://github.com/pointfreeco/swift-snapshot-testing)

### Inferences
- Masking by copying base pixels into head (cue) is simpler than ignore-rect support in the diff engine and keeps panels honest if the clean images are shown separately. Better: demo mode removes the status bar variable at the source, so masks only cover what cannot be pinned (cutout band, scroll indicators, cursor blink).
- Turn environment assumptions into preflight gates that fail loudly (display cutout, nav mode, density, font scale, locale, dark mode, animation scales, demo mode active), like cue's `pin-android-display.sh`. A drifted environment should void the comparison, not flag every screen.
- Running base and head on the same emulator instance in the same job removes most environment drift; mixing a base captured weeks ago on another runner image with today's head is the main false-positive generator.
- Use pixelmatch `windowSize` or connected-component clustering to turn pixel noise into boxed regions (Screenmap's "box + arrow for moved"); a hierarchy diff (node added/removed/moved by bounds) can label boxes as "moved" vs "changed" without a VLM.
- VLMs fit only after a deterministic gate, as captioner/classifier for flagged screens; LLMShot's finding that prompt-based ignores are weak argues against using the LLM as the mask mechanism.

### Gaps
- No primary source quantified SSIM vs pixelmatch false-positive rates on emulator captures; SSIM tools not researched.
- No primary Android doc found listing exactly which settings `disable-animations` changes (window/transition/animator scale).
- No published numbers on swiftshader vs host GPU rendering determinism across runner image updates.

## 4. PR presentation, image hosting and fork security

### Takeaway
For a GitHub Action without its own GitHub App, the workable surface is one sticky PR comment (or a PR review) with images, plus a job summary and artifacts; Check Runs with images/buttons require a GitHub App. There is no public API to upload images to GitHub's CDN from Actions, so hosting is the hard part: orphan/cache branch (fails for private repos' viewers without access, unverified), release assets, artifacts (zip, not inline), or external storage. Fork PRs must split into an unprivileged `pull_request` capture workflow and a privileged `workflow_run` reporter that treats artifacts as untrusted.

### Cited Findings
- Check runs: "To create a check run, you must use a GitHub App"; `output.images` (`alt`, `image_url`, `caption`) appear in the PR UI; annotations max 50 per request (Actions further limits 10 warning + 10 error per step); `message` max 64 KB; up to three requested-action buttons (label ≤ 20 chars); conclusions include `neutral` and `action_required`; max 1000 check runs with the same name per suite — [REST check runs](https://docs.github.com/en/rest/checks/runs)
- Job summaries: max 1 MiB per step, max 20 step summaries displayed per job, shown on the workflow run summary page — [Workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
- Artifacts: `actions/upload-artifact` `archive: false` uploads a single file as-is, file name becomes the artifact name; archiving on by default — [upload-artifact action.yml mirror](https://gitea.psi.ch/actions/upload-artifact/src/commit/07454fcfbfd4d28d15268785493d994bc9fc66c1/action.yml)
- No public API to upload images to GitHub's CDN (feature request, aggregator) — [claudeissues](https://claudeissues.com/issue/26831-feature-request-allow-posting-images-screenshots-to-github-pr-issue-comments); cue uses the undocumented `uploads.github.com/user-attachments/assets` endpoint with a user token from a local script, not from CI — [attach-pr-media.sh](https://github.com/arun279/cue/blob/feat/expo-native/scripts/attach-pr-media.sh)
- Hosting patterns seen: temporary/orphan branch with raw URLs deleted after merge; draft release assets; Screenmap's persistent `screenmaps` branch plus hosted viewer, artifacts on private repos — [search summary of community patterns](https://proandroiddev.com/automating-ui-change-verification-with-android-compose-screenshot-testing-part2-485784639546); [AppImage PR](https://github.com/AppImage/appimage.github.io/pull/3573); [Screenmap](https://github.com/aleqsio/screenmap)
- Comment strategy: Screenmap uses one sticky comment; cue deletes and recreates its comment each run because edited comments keep their creation timestamp — [Screenmap](https://github.com/aleqsio/screenmap); [cue ci.yml](https://github.com/arun279/cue/blob/main/.github/workflows/ci.yml)
- Services' PR surface: Chromatic "UI Review" status check; Happo status (failure on diff, Accept flips to success) or PR comment; reg-suit commit status + PR comment; Sentry status check + PR comment, approve from PR — [Chromatic](https://www.chromatic.com/docs/review/); [Happo](https://docs.happo.io/docs/continuous-integration); [reg-suit](https://github.com/reg-viz/reg-suit); [Sentry](https://docs.sentry.io/product/snapshots/)
- `pull_request_target` runs with write token and secrets; checking out untrusted PR code there "may lead to repository compromise"; default `persist-credentials: true` leaves the token on disk; recommended split: `pull_request` builds/tests and uploads artifacts, `workflow_run` downloads and comments; artifacts from untrusted PRs are untrusted, extract outside the workspace, PR number is attacker-controlled (look up PR via head SHA instead) — [GitHub Security Lab](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
- Since 2025-12-08, `pull_request_target` always uses the workflow from the default branch; `GITHUB_REF`/`GITHUB_SHA` resolve to the default branch — [GitHub changelog 2025-11-07](https://github.blog/changelog/2025-11-07-actions-pull_request_target-and-environment-branch-protections-changes/)

### Inferences
- Default reporter: `workflow_run` job that reads a JSON manifest from the capture artifact (validated schema, no executables), uploads images to a host, and upserts one sticky comment keyed by a hidden marker. Include a "screens unchanged: N" line and collapse unchanged screens in `<details>`.
- Image host options ranked for a generic OSS Action: (1) a dedicated assets branch in the same repo, pruned by age (works for public repos; private-repo rendering needs verification), (2) user-supplied object storage (S3/R2/GCS) with signed or public URLs, (3) artifacts + job summary link only (zero setup, no inline images). Avoid the undocumented user-attachments endpoint in CI.
- Ship an optional GitHub App mode later for Check Runs with `output.images`, `neutral` conclusion (advisory) and an "Accept as baseline" requested action.
- A capture workflow on `pull_request` from a fork gets no secrets, so deterministic backend state must be serviceable without secrets (fixtures in repo, local mock server), which suits the planned design.

### Gaps
- Whether raw.githubusercontent.com or blob `?raw=true` images render in PR comments for private repos was not verified from a primary source.
- Whether `GITHUB_TOKEN` can create check runs from Actions was not stated on the REST page (docs say GitHub App required; Actions' own token is an App installation token, unverified here).
- Artifact retention defaults and their effect on stored baselines were not researched.

## 5. Baseline strategy: same-run base build vs stored goldens

### Takeaway
Four models exist: (a) goldens committed in the repo (Paparazzi, Roborazzi, CPST, Shot, swift-snapshot-testing), (b) per-commit captures in a service selected by merge base and approval (Chromatic, Percy, Argos, Happo, Emerge/Sentry, reg-suit), (c) cached base captures from base-branch CI runs (Screenmap branch cache, cue's push-run artifacts, Roborazzi's main artifact), (d) building and capturing base on demand (Chromatic `--patch-build`). For device-level runs, (c) is cheapest but drifts with environment; (d) in the same job is the most robust but roughly doubles device time.

### Cited Findings
- Repo goldens: Paparazzi `src/test/snapshots` with Git LFS; CPST `src/screenshotTest{Variant}/reference`; swift-snapshot-testing `__Snapshots__`, same-simulator requirement — [Paparazzi](https://github.com/cashapp/paparazzi); [CPST](https://developer.android.com/studio/preview/compose-screenshot-testing); [swift-snapshot-testing](https://github.com/pointfreeco/swift-snapshot-testing)
- Service baselines by merge base + approval: Argos (ancestor of merge base, approved, auto-approved default branch); Chromatic (per-branch baselines, most recent approved change); Percy (target branch latest, approved on approval-required branches); Happo (baseline report from merge base); Emerge/Sentry (base commit is golden, git metadata) — [Argos](https://argos-ci.com/docs/baseline-build); [Chromatic](https://www.chromatic.com/docs/branching-and-baselines/); [Percy](https://www.browserstack.com/docs/percy/visual-testing-workflows/baseline-management/base-build-tutorial-for-git); [Happo](https://docs.happo.io/docs/continuous-integration); [Emerge](https://docs.emergetools.com/docs/snapshot-testing); [Sentry](https://docs.sentry.io/product/snapshots/)
- Cached base captures: Screenmap baseline map on `screenmaps` branch, PR captures head side only; cue pulls base screenshots from the base SHA's push run and reports when missing; Roborazzi sample downloads main's artifact — [Screenmap](https://github.com/aleqsio/screenmap); [cue gather-pr-media.sh](https://github.com/arun279/cue/blob/feat/expo-native/scripts/gather-pr-media.sh); [Roborazzi](https://github.com/takahirom/roborazzi)
- On-demand base: Chromatic UI Review needs a base build at the merge base, else `--patch-build=$head...$base` — [Chromatic](https://www.chromatic.com/docs/branching-and-baselines/)
- Drift risk demonstrated: environment differences between runs (AVD snapshot cutout) flagged every Android screen — [cue PR #125](https://github.com/arun279/cue/pull/125)

### Inferences
- Recommended hybrid: capture base and head in the same job on the same booted emulator for affected screens only (two APKs installed side by side via different applicationId suffix, or sequential install), and fall back to a cached base only when the base APK cannot be built. Record environment fingerprint (system image build, emulator version, GPU mode, density, font scale) with every capture; refuse cached comparisons when fingerprints differ.
- Same-run base build cost: one extra Gradle build (cacheable via the base SHA's build cache) and N extra screen captures, not a whole second test run, if only suspects are captured.
- Repo-committed goldens do not suit a generic advisory tool (bloat, LFS, review churn); keep "accept" as a label/comment that the tool records, not a file commit.

### Gaps
- No public measurement found of CI minute cost for same-run base vs cached base on Android emulators.

## 6. What remains unsolved for mobile, and ideas to port

### Takeaway
Unsolved: native (non-RN) affected-screen detection, reaching deep screens deterministically with seeded state, environment fingerprinting across runner image updates, iOS cost (macOS minutes) and simulator instability, image hosting for private repos without an App, and trustworthy semantic diff. The best ideas to port are Screenmap's suspects + region boxes + agent-retires-into-flows loop, Argos/Chromatic baseline rules, App Percy's default system-bar masking, cue's preflight gates and three-panel layout, and a deterministic-first, VLM-second pipeline.

### Cited Findings
- Screenmap supports only Expo/RN/NativeScript; native apps not covered — [Screenmap](https://github.com/aleqsio/screenmap)
- Deep-link capture can silently land on a not-found state — [Screenmap](https://github.com/aleqsio/screenmap)
- iOS runs cost ~10x Linux minutes; hosted simulators listed as "coming soon" — [screenmap.dev](https://screenmap.dev)
- Simulator input race drops synthesized taps; daemons stall simulators — [cue PR #126](https://github.com/arun279/cue/pull/126); [cue PR #128](https://github.com/arun279/cue/pull/128)
- Industry ML VRT tools lack public evaluation; no benchmark existed for UI change captioning until WUICC-bench — [arXiv 2607.01728](https://arxiv.org/abs/2607.01728)
- App Percy masks status/nav bars by default with per-device heights — [App Percy Maestro](https://www.browserstack.com/docs/app-percy/integrate/maestro)

### Inferences (ideas to port and how to improve them)
- Suspects (Screenmap) for native Android: map changed files to screens via nav graph XML, Compose `NavHost` route declarations, Activity manifest entries and a module/import graph with N-hop limit; full recapture on theme, `res/values`, manifest, Gradle catalog or design-system module changes (TurboSnap rules). Improvement: also flag "unreachable screens that changed" as likely flake or hidden regression.
- Region-aware diff (Screenmap): boxes for changed, arrows for moved. Improvement: compute "moved" from view-hierarchy node identity (resource-id/testTag/content-desc) instead of pixel heuristics; show a hierarchy delta line per screen ("Button 'Save' moved 24 dp down").
- Three-panel per screen (cue): clean before, clean after, separate diff; crop to the union of changed regions with context for the comment, link full-size.
- Landing verification: assert the screen identity (expected root testTag/activity) before capture, fixing Screenmap's not-found blind spot.
- Preflight gates (cue): demo mode on, animation scales 0, cutout/nav mode/density/locale/font scale pinned and asserted; environment fingerprint stored with captures.
- Baseline eligibility (Argos): show which base commit and why; auto-approve default branch; record accepts as PR comments/labels, not committed files.
- Advisory reporting: sticky comment with "N changed, M unchanged" header (Sentry-style counts), unchanged collapsed; optional App mode for Check Run with `neutral` conclusion and an accept button.
- VLM as captioner after the pixel/hierarchy gate (Roborazzi AI runs only on diff; Screenmap notes), never as the mask; cap per-run budget; cache verdicts by (base hash, head hash).
- Retire exploration into recorded flows (Screenmap): agent-found paths become committed deterministic flows via a follow-up PR.
- Optional sinks: upload captured images to Sentry Snapshots or Argos for teams that want hosted review UIs — [Sentry](https://docs.sentry.io/product/snapshots/); [Argos pricing FAQ](https://argos-ci.com/pricing)

### Gaps
- No open-source native Android/iOS equivalent of Screenmap was found; a broader GitHub search might surface smaller projects.
- No data on how often runner image updates (system image, emulator binary) invalidate cached baselines.

## 7. Item 11: pixelmatch 8 in process (2026-10-24)

- pixelmatch 8.0.0 (ISC, 2026-10-06, mapbox) takes decoded RGBA buffers, defaults `threshold` to
  0.1 and now measures it as the OKLab HyAB distance (7.x and odiff use YIQ); anti-aliased
  pixels are detected and skipped unless `includeAA`. Its `index.d.ts` ships in the package. It
  depends on pngjs `^7.0.0` (MIT, 7.0.0 from 2023-02-20); types from `@types/pngjs` 6.0.5 (MIT).
  License files read from the npm tarballs. — [pixelmatch](https://github.com/mapbox/pixelmatch)
- odiff-bin 4.5.0 (MIT, 2026-07-23) ships native binaries through `@odiff/<platform>` optional
  dependencies; cropping its result still needs a PNG decoder in process.
- Dogfood #95 leaderboard, 1080x2400 PNGs from Maestro: base against a second base capture 0
  pixels, head against head 0, base against head 18,507 pixels in one box (x 190, y 664, 158 by
  558 with a 32 px margin) around the three highlighted avatars. `compare` took 106 ms in
  process, 0.15 s through the CLI with Node start.
