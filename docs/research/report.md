# Rent the driver, own the selection layer

**Build `twinrun`: an Apache-2.0 GitHub Action plus CLI that turns every Android PR into one advisory comment, and spend nearly all of the engineering on the three layers nobody has built: picking the screens a native diff reaches, serving those screens the right backend state, and keeping an AI driver comparable across base and head.** Every other stage can be rented from mature, permissively licensed projects. Maestro (Apache-2.0, 16k stars, MCP server built into the CLI) drives and replays ([Maestro](https://github.com/mobile-dev-inc/Maestro)); mitmproxy serves committed fixtures fail-closed ([mitmproxy options](https://docs.mitmproxy.org/stable/concepts/options/)); odiff or pixelmatch compares pixels; and a KVM emulator on a free public-repo `ubuntu-latest` runner cold-boots in about **25 seconds** ([first-party run](https://github.com/bwhtech/helpdesk_mobile/actions/runs/38678273450)). The closest existing tool, Screenmap, proves the shape (diff to "suspect" screens, deterministic replay first, an agent only for gaps, a comment that "reports, it does not gate") but only for Expo and React Native ([Screenmap](https://github.com/aleqsio/screenmap)). Google's Firebase App Testing agent proves "AI explores once, then replays", but it is closed, capped at 200 tests a month in preview, and runs on Google's devices ([Firebase](https://firebase.google.com/docs/app-distribution/android/app-testing-agent)), while Firebase Test Lab, the old default, **shuts down on 2027-09-30** ([FTL migrate FAQ](https://firebase.google.com/docs/test-lab/migrate-faq)). No tool, open or commercial, publishes precision or recall for diff-to-screen mapping or a false-positive rate for LLM visual judgement, so the product must report rather than gate, and must measure its own accuracy. The fixed defaults are: Maestro as driver and replay format, with an agent that explores base once over MCP and whose recorded YAML replays on head; mitmproxy with HAR fixtures; odiff plus a view-hierarchy diff, with an optional VLM caption; one sticky PR comment; and a `pull_request` build job split from a `workflow_run` device job. CI costs **$0 on public repos and about $0.07 to $0.18 on private ones**. LLM tokens add about **$0.10 on a replay-only PR and $0.45 on a PR that needs exploration** with a Sonnet-class model. iOS comes second and adds about $1 to $1.55 of macOS minutes per PR.

## Nine of ten pipeline stages already have mature open source parts

The pipeline breaks into ten stages. In nine of them, open source covers the work well enough to depend on. Commercial products either sit on closed device fleets or accept images that someone else produced. Screen selection is the exception: no tool does it for native mobile apps.

| Stage | Open source to build on (license) | Commercial or closed | Where existing tools stop |
|---|---|---|---|
| Trigger and secrets | GitHub's `pull_request` + `workflow_run` split pattern | n/a | A documented pattern; no mobile tool ships it |
| Build base and head | Gradle, Xcode; AffectedModuleDetector (Apache-2.0, archived by Dropbox, forked by Flo Health) | n/a | Nobody builds the merge base next to head for a device comparison |
| Device | android-emulator-runner, Gradle Managed Devices, docker-android, Redroid | Genymotion SaaS, AWS Device Farm, Sauce Labs, TestMu AI, Maestro Cloud, emulator.wtf, Firebase Test Lab (ends 2027-09-30) | Batch services cannot host an interactive agent loop |
| Screen selection | Screenmap (MIT, Expo/RN/NativeScript only), ComposablePreviewScanner (MIT), Showkase (Apache-2.0), Nx, Turborepo, bazel-diff, IndexStoreDB | Chromatic TurboSnap, Datadog TIA, Microsoft TIA, CloudBees Smart Tests, Codecov ATS | No native Android or iOS diff-to-screen tool; no published accuracy anywhere |
| Navigation | Maestro flows and tags, Android deep links, DroidBot UI transition graph (MIT) | Firebase Robo crawl graph (export not documented) | Deep links can land on a not-found screen and nobody notices |
| Backend state | mitmproxy, WireMock, Mockoon (MIT), Prism (Apache-2.0), Hoverfly (Apache 2.0), Microcks, OkReplay (Apache-2.0), Keploy (Apache-2.0) | Speedscale proxymock, Meticulous (web only) | No record, scrub, refresh and replay loop exists for mobile |
| Driving | Maestro, agent-device (MIT), mobile-mcp (Apache-2.0), appium-mcp (Apache-2.0), Arbigent (Apache-2.0), Midscene (MIT), Mobilerun (MIT), mobile-use (Apache-2.0) | Firebase App Testing agent, Android Studio Journeys, GPT Driver, Minitap, Autosana, Quash, AskUI, QA Wolf | None drives base and head identically on purpose |
| Runtime signals | adb `logcat` / `dumpsys` / `screencap`, Maestro 2.7 crash and ANR bundle, LeakCanary, Espresso accessibility checks | Firebase Test Lab results with an "inconclusive" outcome | Signals are reported per run, not as a base vs head delta |
| Visual diff and judgement | pixelmatch (ISC), odiff (MIT), reg-suit (MIT), Roborazzi, Paparazzi and Shot (Apache-2.0), swift-snapshot-testing (MIT) | Applitools, App Percy, Chromatic | Libraries work on previews; no public evaluation of ML judges |
| Baseline, review, PR surface | Argos (MIT), reg-suit, Screenmap's sticky comment, cue's scripts (MIT) | Chromatic, Percy, Happo, Sentry Snapshots (beta) | Services take uploaded images; none of them drives the app |

### Drivers are a commodity; the replay format is the real choice

Driving is the most crowded stage. Maestro is the anchor: Apache-2.0, 16,111 stars, more than 100 contributors, and monthly releases through cli-2.11.0 on 2026-09-29. Its MCP server has been inside the CLI since 1.41.0 (2025-06-25). Release 2.7.0 replaced `maestro chat` with MCP and added a per-flow bundle with device logs, crash and ANR reports, and a screenshot before every step ([CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md)). The MCP tools (`inspect_screen`, `take_screenshot`, and `run` for inline YAML that is validated on every call) contain no AI themselves; the calling agent is the AI ([Maestro MCP docs](https://docs.maestro.dev/get-started/maestro-mcp)).

Two accessibility-first bridges sit beside it. Callstack's **agent-device** (MIT, 5,067 stars, 74 contributors) addresses elements by snapshot refs, prints `+`/`-`/`=` snapshot diffs, captures crash details, logs and network, and **exports runs as strict Maestro YAML** ([agent-device](https://github.com/callstack/agent-device)). **mobile-mcp** (Apache-2.0, 9,727 stars) covers real and virtual Android and iOS devices but sends telemetry to PostHog and Scarf unless `MOBILEMCP_DISABLE_TELEMETRY` is set ([mobile-mcp](https://github.com/mobile-next/mobile-mcp)).

The autonomous agents are healthy but more opinionated: Midscene (MIT, vision-first), Mobilerun (MIT, the renamed DroidRun), mobile-use (Apache-2.0) and Arbigent (Apache-2.0, five contributors). The research agents (AppAgent, AutoDroid, DroidAgent) are dormant, and DroidAgent has no license file, so only its ideas can be reused ([DroidAgent](https://github.com/coinse/droidagent)).

On the commercial side, the Firebase App Testing agent is free during preview within **200 tests per month per project** and is Android-only on its page ([Firebase](https://firebase.google.com/docs/app-distribution/android/app-testing-agent)). Android Studio Journeys sends a screenshot to Gemini at every action and needs AGP 9 ([Journeys](https://developer.android.com/studio/gemini/journeys)). The startups are closed SaaS priced from €49 a month at AskUI to $510 a month at Minitap and "from $500" at Autosana ([AskUI](https://askui.com/pricing); [Minitap](https://www.minitap.ai/de/pricing); [Autosana](https://blog.autosana.ai/appium-vs-autosana-ai-testing-comparison)). None of them exposes an open driver that a generic tool could embed. The consequence is that picking a driver is a minor decision; what matters is the script format the driver leaves behind. Maestro YAML is already that interchange format, since agent-device exports it and Arbigent consumes it ([Arbigent](https://github.com/takahirom/arbigent)).

### Linux emulators are cheap and fast; AVD caching and macOS are not

Android emulators get hardware acceleration only on GitHub-hosted **Linux x64** runners. Apple's Virtualization Framework rules out nested virtualization on arm64 macOS ([GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)). The bwhtech/helpdesk_mobile CI runs an emulator on every PR and gives a first-party baseline: an API 35 `google_apis` image cold-booted in **25.5 s**, the whole job (build, SDK setup, boot, 10 instrumented tests) took **6 to 7 minutes**, and a **2.3 GB AVD snapshot cache took 29 s to restore before the emulator rejected it** as incompatible after an emulator auto-update ([run 38678273450](https://github.com/bwhtech/helpdesk_mobile/actions/runs/38678273450)). The cue repo hit the same trap and worse: a cached snapshot taken before the display cutout applied shifted the status bar by 31 px and "flags every Android screen" in the comparison ([cue PR #125](https://github.com/arun279/cue/pull/125)). Cold boot with a pinned emulator build is the right default.

iOS simulators run on arm64 macOS runners at **$0.062 per minute, about ten times Linux 2-core at $0.006** ([runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)). Free, Pro and Team plans can run only **five macOS jobs at once** ([limits](https://docs.github.com/en/actions/reference/limits)), and one runner-images issue reports simulator starts of ten minutes or more ([runner-images#9591](https://github.com/actions/runner-images/issues/9591)).

Device clouds split into batch services that run a suite and return artifacts (Firebase Test Lab, emulator.wtf) and interactive clouds reachable over adb or Appium. The cheapest live option found is Genymotion SaaS at $0.06 per device-minute ([Genymotion](https://www.genymotion.com/pricing/)); AWS Device Farm real devices cost $0.17 ([AWS](https://aws.amazon.com/device-farm/pricing/)). Flank and Fladle ride on Firebase Test Lab and inherit its shutdown date ([Flank](https://github.com/Flank/flank)).

### Two proxies cover backend state; Android's CA rules are the obstacle

**mitmproxy** and **WireMock** are the only tools that fit a generic, no-code-change mobile action. mitmproxy's `server_replay` has explicit matching knobs (ignore params, payload params, content, host, port; headers opt-in). It consumes each recorded flow once by default, which replays "list, create, list again" in order, and `server_replay_extra` can answer unmatched requests with 404 or kill them instead of forwarding to the internet ([mitmproxy options](https://docs.mitmproxy.org/stable/concepts/options/)). WireMock records to JSON stubs, matches JSON bodies while ignoring array order and extra elements, and turns repeated identical requests into ordered Scenarios by default ([WireMock record-playback](https://wiremock.org/docs/record-playback/)). The research did not re-verify their licenses; both are believed MIT and Apache-2.0 respectively.

The alternatives each fail one requirement. Mockoon records only from its GUI, one route per path and method ([Mockoon](https://mockoon.com/docs/latest/logging-and-recording/auto-mocking-and-recording/)). Prism is stateless ([Prism](https://github.com/stoplightio/prism)). Speedscale's CI use needs Enterprise ([proxymock](https://docs.speedscale.com/proxymock/how-it-works/cli/)). OkReplay works only inside OkHttp ([OkReplay](https://github.com/airbnb/okreplay)). Keploy captures Linux backends, not apps ([Keploy](https://github.com/keploy/keploy)).

The hard part is TLS. Apps targeting API 24 and higher trust only system CAs. A `<debug-overrides>` block applies only to debuggable builds, adds its trust anchors everywhere, and **skips certificate pinning for chains that use them** ([network security config](https://developer.android.com/privacy-and-security/security-config)). The emulator's own `-http-proxy` flag forwards HTTPS without decrypting it ([emulator proxy](https://developer.android.com/studio/run/emulator-networking-proxy)), and since Android 14, injecting a system CA needs a root bind-mount over an immutable APEX path on every boot ([HTTP Toolkit](https://httptoolkit.com/blog/android-14-install-system-ca-certificate/)).

### Diff libraries and review services each stop halfway

Paparazzi, Roborazzi, Compose Preview Screenshot Testing, Shot and swift-snapshot-testing render components or previews, keep goldens in the repo, and stop at a local HTML report ([Roborazzi](https://github.com/takahirom/roborazzi); [Paparazzi](https://github.com/cashapp/paparazzi); [CPST](https://developer.android.com/studio/preview/compose-screenshot-testing)). Hosted review services stop at "upload images you produced". Sentry Snapshots (beta since 2026-06-11) takes images from "any tool that outputs images" and picks the base from git metadata ([Sentry docs](https://docs.sentry.io/product/snapshots/)). Argos (MIT) accepts mobile screenshots and gives 5,000 free a month ([Argos pricing](https://argos-ci.com/pricing)). Lost Pixel, the other MIT option, was archived on 2026-04-22 ([Lost Pixel](https://github.com/lost-pixel/lost-pixel)). Only Screenmap and the bespoke pipeline in arun279/cue close the loop from changed code to a real app on a device to before and after images on the PR ([cue PR #124](https://github.com/arun279/cue/pull/124)).

### Selection is borrowed from test impact analysis and has never been done natively

Test impact analysis comes in three families. Static dependency graphs (Nx, Turborepo, bazel-diff, AffectedModuleDetector) are open and deterministic but coarse ([Nx](https://nx.dev/docs/features/ci-features/affected); [AffectedModuleDetector](https://github.com/dropbox/AffectedModuleDetector)). Per-test coverage maps are closed, and Datadog does not list Kotlin or Android among its languages ([Datadog TIA](https://docs.datadoghq.com/tests/test_impact_analysis/)). History-trained models need data a new tool does not have; Meta's predictive selection catches over 99.9% of faulty changes while roughly halving test cost ([Meta PTS](https://arxiv.org/abs/1810.05286)). Every mature tool shares the same safety net: global paths that force a full run, unknown file types that force a full run, a manual override and a periodic full run ([Microsoft TIA](https://learn.microsoft.com/en-us/azure/devops/pipelines/test/test-impact-analysis)).

Chromatic's TurboSnap is the model to port. It traces git changes through the bundler graph to story files, copies unaffected snapshots at 0.2 of the billing cost, and falls back to a full rebuild on config or lockfile changes ([TurboSnap](https://www.chromatic.com/docs/turbosnap/)). No public tool does TurboSnap-style selection over Android `@Preview`s or screens. Sentry Snapshots, Showkase, ComposablePreviewScanner and Roborazzi all capture everything or filter by package or annotation ([Sentry Android](https://docs.sentry.io/platforms/android/snapshots/); [ComposablePreviewScanner](https://github.com/sergio-sastre/ComposablePreviewScanner)).

## Eighteen proven ideas to port, each with a sharper edge

Most of the product is a recombination of ideas that already work somewhere else. The table records where each idea comes from, the license that governs reuse (an idea from a closed product is a concept, not code), and what this tool does better with it.

| # | Idea | Source | License | How `twinrun` improves it |
|---|---|---|---|---|
| 1 | Suspect screens from the diff, with a hop limit (1 to 3), a broad-change cap of 8, and an agent allowed to demote | Screenmap ([repo](https://github.com/aleqsio/screenmap)) | MIT | Native graph built from bytecode plus a navigation registry, supertype edges that can be walked in reverse, an evidence chain for every screen, and every demotion logged in the comment |
| 2 | Global triggers that force a wide run; bypass when the graph is untouched | Chromatic TurboSnap ([docs](https://www.chromatic.com/docs/turbosnap/)) | Proprietary service; concept only | Android global classes (version catalog, theme, `res/values`, manifest, `Application`, DI roots); a "no screens affected" exit before any build runs |
| 3 | Fail toward running more: override label, periodic full run | Microsoft TIA, Datadog TIA, AffectedModuleDetector | Closed; closed; Apache-2.0 (archived) | A capped smoke set instead of run-everything; the weekly full run on main doubles as ground truth for measuring selection recall |
| 4 | Bytecode scanning with ClassGraph | ComposablePreviewScanner ([repo](https://github.com/sergio-sastre/ComposablePreviewScanner)) | MIT | Used for the reverse-reference graph and screen registry, not only for previews |
| 5 | AI explores once, then replays deterministically | Firebase App Testing agent; Arbigent `replayWithFallback`; Midscene plan cache ([Midscene](https://midscenejs.com/caching)) | Closed; Apache-2.0; MIT | Explore on base, freeze the script, replay it unchanged on head; divergence on head becomes a reported finding and is never silently healed |
| 6 | Maestro YAML as the interchange script | Maestro; agent-device export | Apache-2.0; MIT | The only replay format, with the landing assertion written into the flow so drift detection is native to Maestro |
| 7 | AI assertions optional by default; assertions never cached | Maestro `assertWithAI` ([docs](https://docs.maestro.dev/reference/commands-available/assertwithai)); Midscene; Firebase | Apache-2.0; MIT; closed | AI never sets a check status; it captions only after a deterministic diff flags a screen, and captions are cached by image hashes |
| 8 | Snapshot diffs with `+`/`-`/`=` markers and stable refs | agent-device ([repo](https://github.com/callstack/agent-device)) | MIT | A base vs head hierarchy diff that labels each pixel region as moved, changed, added or removed |
| 9 | Paths the agent finds become committed flows | Screenmap | MIT | Recorded on base during the PR itself, linked from the comment, and batched into a flows PR after merge |
| 10 | Fail-closed replay with matching knobs and ordered repeats | mitmproxy `server_replay`; WireMock `repeatsAsScenarios` | MIT; Apache-2.0 (not re-verified) | Head-only misses reported as a PR signal; the mock's count of in-flight requests used as a network-idle readiness gate; engine-neutral HAR fixture store |
| 11 | A debug-only trust anchor that also overrides pins | Android network security config ([docs](https://developer.android.com/privacy-and-security/security-config)) | Platform feature | One XML file that `twinrun init` generates, scoped to debug builds |
| 12 | System CA injection by APEX bind-mount | HTTP Toolkit ([blog](https://httptoolkit.com/blog/android-14-install-system-ca-certificate/)) | Published technique | Opt-in zero-change mode, repeated on every boot |
| 13 | Preflight environment gates, no retries, three-panel review (clean before, clean after, separate diff) | arun279/cue ([PR #125](https://github.com/arun279/cue/pull/125); [no-flake-masks test](https://github.com/arun279/cue/blob/feat/expo-native/test/ci/no-flake-masks.test.ts)) | MIT | An environment fingerprint stored with every capture; drift voids the comparison as "inconclusive" instead of flagging every screen |
| 14 | SystemUI demo mode (fixed clock, battery, signal, no notifications) | AOSP ([demo_mode.md](https://android.googlesource.com/platform/frameworks/base/+/master/packages/SystemUI/docs/demo_mode.md)) | Platform feature | Pins the status bar at the source, so there are no default masks |
| 15 | Merge-base baseline with a visible "why this base" explanation | Argos ([baseline docs](https://argos-ci.com/docs/baseline-build)), Chromatic, Percy | MIT; commercial | Base built and captured in the same job on the same emulator; the comment names the base SHA |
| 16 | Layout match level and floating regions | Applitools ([match levels](https://applitools.com/docs/common/cmn-eyes-match-levels.html)) | Commercial; concept only | Computed from hierarchy dumps, with no proprietary model |
| 17 | "Inconclusive" outcome for infra failures; video stitched from screenshots | Firebase Test Lab and Robo ([results](https://firebase.google.com/docs/test-lab/android/analyzing-results)) | Closed service; concept only | Applied per screen; a video built from per-step screenshots avoids `screenrecord`'s 180 s cap |
| 18 | Unprivileged build, privileged reporter | GitHub Security Lab ([guide](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)) | Public guidance | The device job holds the LLM key but no write token; a separate publish job holds the write token but runs nothing from the PR |

Three of these ports change the product's character rather than polish it.

**Explore once, replay on head (5)** turns the agent from a source of noise into a source of signal. Google says its own agent "may take different actions while following the same instructions" ([Firebase](https://firebase.google.com/docs/app-distribution/android/app-testing-agent)). Midscene warns that caching "isn't a way to ensure long-term script stability" ([Midscene](https://midscenejs.com/caching)). If both base and head are explored independently, a screenshot difference can come from the agent rather than the code. Freezing base's path removes that variable, and a head that can no longer follow the path has told the reviewer something real.

**Fail-closed replay (10)** pays off three times. It makes runs deterministic. Misses become a review signal ("head calls `GET /v2/orders`, which no fixture covers"). And the proxy already knows when the app has no request in flight, which gives a generic readiness gate. cue had to hand-write that gate for each screen after captures caught half-loaded headers ([cue PR #128](https://github.com/arun279/cue/pull/128)).

**The environment fingerprint (13)** turns cue's hard-won lesson into a rule. A drifted emulator should void the comparison, not produce a comment where every screen looks changed.

Licensing constrains a few choices. DroidAgent has no license file, so its code cannot be used. AffectedModuleDetector and Lost Pixel are archived. mobile-mcp's telemetry must be switched off by default in anything that wraps it. appium-mcp's README warns against exposing it to untrusted users ([appium-mcp](https://github.com/appium/appium-mcp)). Concepts from TurboSnap, Applitools and Firebase carry no license burden, because nothing is copied but the idea.

## Four unsolved problems are the product

Everything in the first section is solved well enough to rent. Four problems are not, and together they define what makes `twinrun` worth building.

**First, nobody maps a native diff to screens.** Screenmap builds route edges from a regex over expo-router and react-navigation code, and its README scopes it to Expo, React Native and NativeScript ([Screenmap](https://github.com/aleqsio/screenmap); [screenmap.dev](https://screenmap.dev)). Preview tools capture everything. Coverage-based impact tools do not list Android. Academic static GUI models such as GATOR over-approximate and include transitions that cannot happen ([ProMal, ICSE 2021](https://2021.icse-conferences.org/details/icse-2021-ACM-Student-Research-Competition/11/ProMal-Precise-Window-Transition-Graphs-for-Android-via-Synergy-of-Program-Analysis-)). No source anywhere gives precision or recall for diff-to-screen mapping, static or LLM-based.

A native solution needs four things. A screen registry built from type-safe Compose Navigation routes, nav XML and the manifest ([deep link docs](https://developer.android.com/guide/navigation/design/deep-link)). A reverse-reference graph that survives dependency injection (walk supertype edges backwards), inlining (a grep supplement for `const val` and `inline fun`) and resources (a grep by resource key). An LLM that adjudicates the candidates rather than discovering them. And a recall number the tool measures itself.

**Second, the right screen in the wrong state shows nothing.** A ViewModel, repository or DTO change often looks identical on default fixture data. Every selection system reviewed treats "screen" as the unit and ignores state. Meticulous, the closest web analogue, handles mutation-then-read flows only within one recorded session ([Meticulous](https://app.meticulous.ai/docs/concepts/network-recording-and-patching)), and no surveyed tool records, scrubs, validates and refreshes mobile fixtures end to end.

The differentiator is to treat fixture **scenarios** (`default`, `empty`, `long-text`, `error`) as a closed vocabulary. The adjudicator assigns a scenario to each selected screen and gives a reason, which couples selection to backend state for the first time.

**Third, an AI driver breaks base vs head comparability.** Firebase caches actions per device, Arbigent replays scenarios that passed before, and Midscene caches plans. All three aim to make one test pass again. None is designed around a pair of builds where divergence on head is the finding. Agents also still fail on hard tasks: on MobileWorld the best agent scores **51.7%** and the best end-to-end GUI model **20.9%** ([benchmarklist MobileWorld](https://benchmarklist.com/benchmarks/mobileworld/), aggregator). An exploration that fails once must leave a usable trace, not a misleading screenshot.

**Fourth, there is no quiet, trustworthy judge of "changed".** WUICC-bench finds that pixel comparison "treats rendering noise and genuine defects identically" and that industry ML visual testing tools "lack public evaluation" ([arXiv 2607.01728](https://arxiv.org/abs/2607.01728)). LLMShot found that prompt-based selective ignoring "showed significant limitations" ([arXiv 2507.10062](https://arxiv.org/abs/2507.10062)). Maestro makes its own AI assertions non-blocking by default "to prevent unstable AI responses from breaking CI/CD pipelines" ([Maestro](https://docs.maestro.dev/reference/commands-available/assertwithai)). No tool publishes a false-positive rate for `assertWithAI`, `aiAssert` or Firebase's AI assertions.

Screenmap's own author names a related blind spot: "Nothing verifies that a deep link landed on the screen you meant" ([Screenmap](https://github.com/aleqsio/screenmap)). The fix is deterministic first: pin the environment and assert it, verify landing against an expected root identifier, cluster pixel changes into regions, and label the regions from the hierarchy. A VLM then captions what the gate already flagged.

The steelman against building any of this deserves an answer. **Why not contribute to Screenmap?** It has the right shape, but its graph is a JavaScript import trace, its navigation relies on argent flows and OCR landmarks (tesseract on Linux "recovers noticeably fewer words"), and native Android needs bytecode analysis and a different driver. The better move is to stay compatible with its route conventions for React Native apps in v2, not to compete on its home ground.

**Why not wait for Google?** The Firebase agent is tied to App Distribution and Google's fleet, cannot replay against a local deterministic backend, and is quota-limited in preview. Journeys is Gemini-only.

**Why not ship previews only**, the way Sentry Snapshots does? Previews cannot see navigation, real data flow, insets or system UI. That is why a device run exists at all, though a preview tier is a sensible v2 addition.

## The final product: `twinrun`, a two-workflow advisory action

`twinrun` is an Apache-2.0 GitHub Action and CLI for Android apps, with iOS in v2. On every PR it:

1. builds base and head debug builds;
2. works out which screens the diff reaches, and in what backend state;
3. drives both builds on one pinned emulator against the same committed fixtures;
4. posts one sticky comment with before and after crops, new crashes and ANRs, and backend misses.

It never fails a check because of what it finds, and it works with no LLM at all. AI adds adjudication, exploration of screens nothing else can reach, and captions.

The language split follows the dependencies. The orchestrator is TypeScript on Node 22, because the Actions toolkit, the MCP SDK, odiff's Node binding and agent-device's Node API all live there. The graph analyzer is a small Kotlin/JVM jar built on ClassGraph. The mock is a Python addon running inside mitmproxy.

### Architecture

```text
PR opened or synchronized
│
├─ Workflow A "twinrun-build"   on: pull_request   (read-only token, no secrets)
│    1. checkout, fetch-depth 0, compute merge base
│    2. classify diff; zero impact → write "no screens affected" manifest, stop
│    3. build base (merge base) and head debug APKs with the Gradle build cache
│    4. twinrun plan --static → plan.json (candidate screens + evidence paths)
│    5. upload artifact: base.apk, head.apk, plan.json, manifest.json
│
└─ Workflow B "twinrun-run"     on: workflow_run   (default-branch workflow file)
     job "drive"   (LLM key; permissions: actions read only; fork PRs need environment approval)
       1. download artifact outside the workspace, validate manifest schema, find PR by head SHA
       2. LLM adjudication → final screens, rank, fixture scenario per screen, reasons
       3. boot pinned emulator cold; readiness and preflight gates; record environment fingerprint
       4. start mitmproxy + replay addon (fail-closed); set system proxy; push CA
       5. BASE: install, log in, per screen navigate (deep link → flow → agent), wait, capture, record script
       6. HEAD: pm clear, install, replay base's script per screen, wait, capture; divergence = finding
       7. compare: odiff + hierarchy diff → regions; optional VLM caption on changed screens only
       8. upload result bundle (PNGs, hierarchy, logcat, misses, recorded flows, report.json)
     job "publish" (pull-requests: write, contents: write for assets branch; no LLM key; runs no PR code)
       9. validate bundle (schema, PNG decode, size caps); push crops to assets branch or S3/R2
      10. upsert the sticky comment; write the job summary
```

### Components

**Plan (selection).** The plan step diffs against the merge base and sorts each file into one of four classes: ignored (docs, tests, CI files), global (build scripts, version catalog, theme, `Application`, manifest, DI roots, `res/values` themes and colors, plus user-listed paths), resource (matched by key) or code.

It builds a **screen registry** for both base and head, so it can tell new screens from removed ones. Sources are tried in order of reliability: type-safe `composable<Route>` and `fragment<F, Route>` destinations, nav XML, manifest activities, then string routes. Each entry carries an ID, its deep link pattern, its argument types and an optional flow path.

The reverse-reference graph comes from the compiled classes of both builds via ClassGraph. It walks supertype edges backwards, adds grep edges for resources, constants and inline functions, and stops at fan-out hubs. The default depth is **2 hops**, with a **broad-change cap of 8** screens per changed file. Each candidate keeps its evidence chain (changed symbol, path, screen).

In Workflow B, the LLM adjudicator receives the diff, the candidates with evidence, the registry and the scenario list. It must return registry IDs only, each with a rank, a reason, a scenario and a confidence. It may add or demote screens, and every change is printed in the comment. A global trigger produces a **smoke set**: launch, plus one screen per top-level destination, plus the screens the adjudicator names. The run budget is **8 screens**, the label `twinrun: all` runs the full registry, and a weekly full run on main refreshes the registry and records which screens actually changed, so selection recall can be computed and published.

**Device.** The default device is `ubuntu-latest` x64 with the KVM udev rule, running a `google_apis` x86_64 **API 35** image on a Pixel 6 profile with 2 emulator cores and `swiftshader_indirect`. It is not ATD, because ATD drops SystemUI ([managed devices](https://developer.android.com/studio/test/managed-devices)), and not API 36 until the boot-wait hang is understood ([CircleCI forum](https://discuss.circleci.com/t/starting-android-emulator-with-api-36-hangs-while-waiting-for-boot-animation-with-workaround/54823)).

The emulator build is pinned. Each run cold-boots, and only the system image is cached, not the AVD. Readiness means `sys.boot_completed`, then `pm path android`, then dismissing system ANR dialogs; the bootanim property is never used. Preflight then pins and asserts animations off, demo mode on, density, font scale, locale, dark mode and navigation mode, and the run writes a fingerprint of all of them plus the image and emulator versions. Any failure marks the run "inconclusive" without retrying. A `Device` interface keeps Genymotion SaaS and real-device clouds possible as adapters later.

**Backend.** mitmproxy runs on the host in regular mode. `adb shell settings put global http_proxy 10.0.2.2:8080` routes the app through it. Trust comes from a generated `debug-overrides` network security config by default, or root CA injection in opt-in mode.

Fixtures live in `.twinrun/fixtures/<scenario>/` as **HAR 1.2 JSON**. HAR is readable in code review, easy to scrub and not tied to one engine. The `twinrun` replay addon serves fixtures with mitmproxy's semantics:

- recorded flows are consumed in order;
- the default matcher ignores headers and a denylist of volatile query and body keys;
- unmatched requests get **404 and are logged**;
- `Date` and expiry headers are refreshed;
- absolute timestamps in JSON bodies shift by the gap between record time and launch time, anchored separately for each side.

Base and head both replay **head's fixture set**, and fixture edits in the PR are called out separately. `twinrun record` captures fixtures from a local or staging session and runs a scrubber that strips `Authorization`, `Cookie` and keys and replaces PII with stable fakes. It can run from `workflow_dispatch`. Push notifications, browser OAuth and non-HTTP protocols are out of scope for the mock. Login replays a recorded token exchange through a committed `login` flow.

**Drive.** The default driver is Maestro: the CLI for deterministic replay, and `maestro mcp` as the action channel for the agent. Every step the agent takes is already Maestro YAML, validated by the same runtime that will replay it. The `Driver` interface (`snapshot`, `screenshot`, `act`, `logs`, `crashes`, `exportScript`) keeps agent-device and mobile-mcp as drop-in adapters.

Navigation per screen follows a ladder:

1. a **deep link** (`adb shell am start -W -a android.intent.action.VIEW -d <uri>`) with arguments taken from the scenario's fixtures;
2. a **committed flow** at `.twinrun/flows/<screen-id>.yaml`, tagged with the screen ID;
3. the **agent**, on base only.

Every path ends with a **landing assertion**: the expected root `testTag`, `resource-id` or activity must be present, or the screen is marked "unreachable" rather than "changed".

The agent loop belongs to `twinrun`, so the model is bring-your-own: native Anthropic, or any OpenAI-compatible base URL, which also covers Ollama and self-hosted UI-TARS. The model sees the accessibility hierarchy plus a screenshot downscaled to **540×1200 (about 860 image tokens)**. Prompt caching is mandatory, and the agent is capped at **40 steps per side**. Its only tools are device actions. On head, the recorded script replays without the LLM. If replay diverges, the comment shows where. An optional capped re-navigation on head is labeled "path changed on head".

**Signals.** Two logcat streams start before the first launch: `logcat -b all -v threadtime,epoch,uid` and `-b crash` ([logcat](https://developer.android.com/tools/logcat)). Crashes and ANRs are detected from `FATAL EXCEPTION`, `ANR in <pkg>` and tombstone lines, cross-checked against Maestro's crash and ANR bundle. Each crash is attributed by side: **new on head**, pre-existing, or fixed on head. Frame and memory figures stay out of v1, because Google "strongly discourages" emulator benchmarks ([benchmarking in CI](https://developer.android.com/topic/performance/benchmarking/benchmarking-in-ci)).

**Compare.** Captures come full resolution from `adb exec-out screencap -p`, after a readiness wait that requires two identical consecutive hierarchy dumps and zero in-flight requests at the mock. **odiff** compares with antialiasing detection and threshold 0.1. It was chosen over pixelmatch for speed: 1.17 s against 7.71 s on its own full-page benchmark ([odiff](https://github.com/dmtrKovalenko/odiff)).

Changed pixels are clustered into regions. Hierarchy nodes are matched by `resource-id`, `testTag` or content description to label each region as moved, changed, added or removed (for example "Button 'Save' moved 24 dp down"). Each screen ends in one of six outcomes: **changed, unchanged, new, removed, unreachable, inconclusive**. When a key is present, one VLM call per changed screen writes a one-line caption, labeled "AI note" and cached by the pair of image hashes.

**Report.** One sticky comment, found by a hidden marker and edited in place, carries a header line with the head SHA, merge-base SHA and update time. Editing in place fixes cue's stale-timestamp complaint without the notification noise of deleting and recreating the comment ([cue ci.yml](https://github.com/arun279/cue/blob/main/.github/workflows/ci.yml)).

New crashes come first. Each changed screen then gets a three-panel crop (before, after, highlighted diff) around the union of its regions, with a link to the full-size images. Collapsed sections cover unchanged screens, skipped screens with reasons, adjudicator additions and demotions, backend misses, fixture age and a cost line. The job summary mirrors the comment, and artifacts hold the full bundle, including a video stitched from step screenshots.

Images go to an orphan `twinrun-assets` branch, pruned 30 days after the PR closes. Private repos can use S3 or R2 instead, or fall back to artifacts with no inline images. The undocumented `user-attachments` upload endpoint is never used from CI ([cue attach script](https://github.com/arun279/cue/blob/feat/expo-native/scripts/attach-pr-media.sh)).

```md
### twinrun: 3 changed · 4 unchanged · 1 new crash on head
head 4e1f2a9 vs merge base 9c07b13 · API 35 Pixel 6 · fixtures 12 days old · updated 14:02 UTC
New crash on head: OrderDetail (scenario: empty) · IllegalStateException in OrderDetailViewModel.kt:88
| Screen | Why selected | Result |
| OrderList | OrderRow.kt → OrderListScreen (1 hop) | changed: 2 regions · AI note: row height grew |
<details>Unchanged (4)</details> <details>Skipped (2): Settings, budget</details> <details>Backend: 1 head-only miss</details>
```

### Defaults at a glance

| Decision | Default | Why |
|---|---|---|
| Driver | Maestro CLI for replay, `maestro mcp` for the agent | Apache-2.0, most mature, crash/ANR bundle, the agent writes the replay format directly |
| Replay format | Maestro YAML, one flow per screen ID, with a landing assertion | Two exporters already exist; readable in review |
| Agent | BYO model through Anthropic or any OpenAI-compatible URL; hierarchy plus 540×1200 screenshot; 40 steps per side; base only | Cost and comparability |
| Mock engine | mitmproxy plus the `twinrun` HAR replay addon, fail-closed 404 | Python addon hook, ordered replay, miss logging |
| CA trust | Debug-only `network_security_config` | Works on stock images, bypasses pinning only in debug |
| Device | `ubuntu-latest` x64, API 35 `google_apis`, Pixel 6, pinned emulator, cold boot | Measured 25.5 s boot; snapshot caching proved harmful |
| Diff method | odiff threshold 0.1 with antialiasing, region clustering, hierarchy labels, optional VLM caption | Deterministic gate first; AI explains, never decides |
| Baseline | Same-run base build from the merge base, same emulator, same fixtures | Removes environment drift; no goldens in the repo |
| PR surface | One sticky comment plus job summary plus artifacts; never a failing check | Advisory only |
| CI security | `pull_request` build (no secrets) → `workflow_run` with separate drive and publish jobs; fork runs need environment approval | Follows GitHub Security Lab and the 2025-26 `pull_request_target` hardening |
| Caps | 8 screens, 40 steps per side, `timeout-minutes: 20`, `concurrency` with `cancel-in-progress` | Predictable cost |

A repo opts in with one file:

```yaml
# .github/twinrun.yml
app:      { module: app, variant: debug, package: com.example.shop }
device:   { api: 35, image: google_apis, profile: pixel_6 }
selection:
  hops: 2
  broad_cap: 8
  max_screens: 8
  global_paths: ["gradle/libs.versions.toml", "app/src/main/res/values/**", "**/ui/theme/**"]
  smoke: [home, orders, profile]
backend:
  mode: replay              # replay | openapi | compose | live
  fixtures: .twinrun/fixtures
  scenarios: [default, empty, long-text, error]
  hosts: [api.example.com, img.example.com]
  trust: nsc                # nsc | root
agent:
  provider: anthropic       # or openai-compatible with base_url
  model: <model id>
  max_steps_per_side: 40
report:
  images: branch            # branch | s3 | artifacts
```

### CI security model

The design follows GitHub Security Lab's split. The `pull_request` workflow builds with a read-only token, no secrets and `persist-credentials: false`. The privileged `workflow_run` workflow treats the artifact as untrusted: it extracts outside the workspace, validates the schema and looks up the PR by head SHA, because the artifact's PR number is attacker-controlled ([Security Lab](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)). `pull_request_target` is never used. Since 2025-12-08 it always runs the default branch's workflow ([changelog](https://github.blog/changelog/2025-11-07-actions-pull_request_target-and-environment-branch-protections-changes/)), and since June 2026 `actions/checkout` refuses fork heads under it ([changelog](https://github.blog/changelog/2026-06-18-safer-pull_request_target-defaults-for-github-actions-checkout)). The tool's own design goes further in four ways.

First, installing a fork-built APK in a privileged context is exactly what Security Lab warns against. So the **drive** job holds only the LLM key and no write token, the APK runs inside the emulator VM where the key never travels, and fork PRs wait for a maintainer to approve a protected `twinrun-fork` environment.

Second, the **publish** job holds the write token but runs nothing from the PR. It decodes every PNG and checks every size before it commits or comments.

Third, Gradle and repo scripts never run in Workflow B. For fork PRs, config and flows come from the default branch, because a flow file is a program for the driver.

Fourth, text on screen in a hostile app can try to steer the agent. That is a cost risk, not a path to exfiltration, because the agent's tools are device actions only and the step cap bounds the spend.

### v1 scope versus later

| Area | v1 (Android) | v2 | Later |
|---|---|---|---|
| Platforms | Emulator on `ubuntu-latest` x64; native Kotlin apps (Compose and Views); React Native and Flutter apps run with config-declared routes | iOS simulator on `macos-latest` arm64, both sides in one job; expo-router and React Navigation route parsing compatible with Screenmap | Real devices through cloud adapters; GitLab and Bitrise |
| Selection | Diff classifier, Android registry, bytecode graph plus grep, adjudication with scenarios, smoke set, `twinrun: all` label, weekly recall measurement | Per-screen JaCoCo coverage tier; a tier-0 render of affected `@Preview`s with Roborazzi; iOS graph from IndexStoreDB | Ranking learned from which screens actually changed |
| Navigation | Deep link, committed flows with landing assertion, agent on base | Flows PR after merge; optional debug entry-point library that takes route plus JSON args | Seeding from a crawl graph |
| Driver | Maestro CLI and MCP | agent-device and mobile-mcp adapters; explorer plug-ins (Arbigent, Midscene) that must return Maestro YAML | appium-mcp for Appium shops |
| Backend | mitmproxy and HAR, `record`, scrubber, NSC trust, scenarios, time shift | Scheduled refresh opening fixture PRs; OpenAPI validation of fixtures; Prism fallback; `compose` real-backend mode; root CA and WireGuard modes; WireMock export | gRPC and WebSocket replay |
| Signals | Crashes, ANRs, native crash lines, attributed by side | gfxinfo and meminfo shown as deltas with a noise caveat; LeakCanary and accessibility results when the app already has them | Performance on real devices |
| Report | Sticky comment, assets branch, S3 or artifacts, job summary | GitHub App mode: Check Run with `neutral` conclusion, `output.images` and an "Accept" button ([check runs](https://docs.github.com/en/rest/checks/runs)); Sentry Snapshots and Argos sinks | Hosted viewer |

### Non-goals

`twinrun` does not gate merges. A finding never turns a check red, and infra failures say "inconclusive". It does not replace unit tests, instrumentation suites or preview screenshot tests such as Paparazzi and Roborazzi; it complements them with the real app. It does not benchmark performance on emulators. It does not test release builds with production pinning, push notifications delivered through FCM, browser OAuth, or non-HTTP protocols in v1. It does not crawl apps autonomously to hunt for bugs: the academic best case is a handful of non-crash bugs across dozens of apps (GraphDroid found 6 in its manual check, DroidAgent 3, VisionDroid 1) ([GraphDroid](https://arxiv.org/abs/2609.10031)), which is the wrong economics for every PR. It does not heal broken flows silently. It does not run a hosted review SaaS. And it does not depend on Firebase Test Lab or Flank.

### Cost per PR

Prices come from GitHub's runner table and Claude's 5.5-generation price list ([runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing); [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)). The CI range assumes 12 to 15 runner minutes for base plus head, extrapolated from the measured 6 to 7 minute single-side job. The token arithmetic follows the CI research notes: 40 steps, an 8k cached prefix, about 1.2k new tokens per step and 150 output tokens per step. Because head replays without the LLM, exploration is paid once rather than twice. Adjudication (about 20k input and 1k output tokens) plus eight captions comes to about **$0.10** on Sonnet 5.5. That figure is this report's own arithmetic, not a published measurement.

| PR type | CI, public repo | CI, private repo (2-core to 4-core) | LLM, Sonnet 5.5 | LLM, Haiku 5.5 | Typical private total |
|---|---|---|---|---|---|
| Zero impact (docs, tests only) | $0 | under $0.01 | $0 | $0 | ~$0.01 |
| Replay only (deep links or committed flows, up to 8 screens) | $0 | $0.07 to $0.18 | ~$0.10 | ~$0.01 | ~$0.17 to $0.28 |
| Exploration on base (40 steps), replay on head | $0 | $0.07 to $0.18 | ~$0.45 | ~$0.03 | ~$0.52 to $0.63 |
| Worst case under caps (head diverges, agent re-navigates) | $0 | $0.07 to $0.18 | ~$0.80 | ~$0.05 | ~$0.87 to $0.98 |
| No AI configured | $0 | $0.07 to $0.18 | $0 | $0 | ~$0.07 to $0.18 |
| iOS (v2), add to any row | $0 | +$0.93 to $1.55 (15 to 25 macOS minutes) | same | same | |

Two levers dominate. **Prompt caching is worth about 8×**: the same Sonnet run without caching costs about $5.30 per PR across both sides. **Downscaling screenshots roughly halves** the cost: a native 1080×2400 capture costs 3,354 image tokens against 860 at 540×1200 ([Claude vision](https://platform.claude.com/docs/en/build-with-claude/vision)). Published agent costs are in the same range. DroidRun averaged about $0.075 per emulator task in one vendor-run comparison ([AIMultiple](https://aimultiple.com/mobile-ai-agent)). Full LLM exploration is the expensive outlier, at about $12 per app for DroidAgent ([GraphDroid](https://arxiv.org/pdf/2609.10031)). A remote device instead of the runner emulator costs about $1.20 per PR on Genymotion SaaS at 20 device-minutes ([Genymotion](https://www.genymotion.com/pricing/)).

### Key risks

| Risk | Why it is real | Mitigation in v1 |
|---|---|---|
| Selection misses the screen that broke | No recall data exists anywhere; DI, reflection, string routes, feature flags and server-driven UI drop static edges | Supertype edges, grep supplements, smoke set, the skipped list in every comment, the `all` label, recall measured from weekly full runs and published |
| TLS interception fails | API 24+ ignores user CAs; Android 17 turns on Certificate Transparency by default, untested against MITM CAs ([NSC](https://developer.android.com/privacy-and-security/security-config)); some apps bypass the system proxy ([mitmproxy modes](https://docs.mitmproxy.org/stable/concepts/modes/)) | NSC default, API 35 pinned, `backend: live` escape hatch labeled in the comment; root and WireGuard modes in v2; a spike on Flutter and API 37 before 1.0 |
| Hosted emulators are flaky | Patrol calls GitHub emulators "slow and unstable" ([Patrol](https://patrol.leancode.co/ci/platforms)); "System UI isn't responding" dialogs block input ([Bitrise forum](https://discuss.bitrise.io/t/android-emulator-shows-dialog-system-ui-isnt-responding-when-it-boots/23381)); snapshot drift flagged every screen in cue | Pinned versions, cold boot, readiness and preflight gates, fingerprint, "inconclusive" instead of false regressions, no retries |
| Agent cost or nondeterminism | Google calls its own agent nondeterministic; uncached runs cost about 8× more | Explore once, replay on head, mandatory caching, step and screen caps, `cancel-in-progress` |
| Hostile PR content | Fork code runs on a runner that holds the LLM key; on-screen prompt injection | Environment approval for forks, drive and publish jobs separated, device-only agent tools, default-branch config and flows for forks |
| Adoption friction | Fixtures, a trust config and flows all come before the first useful comment | `twinrun init` generates the NSC and records a first fixture set; deep links work with no flows; `live` mode gives a first comment on day one |
| Upstream drift | Maestro is vendor-led (removed `maestro chat`, dropped physical iPhones in 2.11.0); no shared MCP tool schema across bridges | Pin Maestro; the `Driver` interface with agent-device as the second adapter in v2 |
| Private-repo images | No public API uploads images to GitHub's CDN; raw-URL rendering for private repos unverified | S3/R2 and artifact modes ship in v1; a spike on branch rendering before 1.0 |
| Overlap with others | Screenmap could add native support; Google could open its agent to local devices | Stay generic, open and BYO-model; interoperate with Screenmap's route conventions instead of competing on React Native |

## Conclusion

The research changes where the effort goes. A year ago, the hard part of "AI tests my PR on a phone" looked like the agent. Now at least six permissively licensed drivers exist, Maestro ships MCP in its CLI, and agent-device exports Maestro YAML, so driving is close to solved and replay formats are converging. What remains unbuilt is everything around the agent that makes its output believable: which screens, in which state, compared against what, and judged by whom. That is why `twinrun` treats AI as a narrow, optional component (adjudicate a candidate list, explore once, caption a flagged region) inside a deterministic pipeline that still produces a useful comment with no model configured.

The less obvious implication is that the mock proxy and the weekly full run are strategic assets, not plumbing. The fail-closed proxy is the determinism layer, a generic readiness signal, and the detector that tells reviewers a PR calls an endpoint nobody recorded. The weekly full run on main is the safety net, and it also produces the first labeled dataset of "this diff changed these screens". Every tool in this space currently ships without such data. Whoever publishes the first honest selection recall and diff false-positive numbers for native mobile will earn the trust that advisory tools otherwise never get, and the v1 definition above is built to collect exactly that evidence from its first week.
