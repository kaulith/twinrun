# AI-driven and scripted mobile UI drivers for a generic PR device testing tool

Scope: driver/agent layer only. All GitHub numbers (stars, license, last push, latest release, contributor count) come from the GitHub REST API and were fetched on 2026-10-18; a contributor count of 100 means the API's first-page limit, so treat it as "100 or more". Sources tagged "(vendor)" are a vendor writing about itself; "(aggregator, unverified)" means I could not confirm it on a primary source.

## 1. Open source drivers: what exists, license, platforms, perception, MCP, CI, maturity

### Takeaway
There are four healthy, permissively licensed families: (a) **Maestro**, the deterministic YAML runner with a built-in MCP server; (b) **MCP/CLI device bridges** that let any LLM drive a device from the accessibility tree (mobile-mcp, Callstack agent-device, appium-mcp); (c) **autonomous agents** (Mobilerun/DroidRun, Minitap mobile-use, Midscene, Arbigent); and (d) **research agents** that are now mostly dormant (AppAgent, DroidAgent, AutoDroid). Maestro is the most mature and is the format others export to; Callstack's agent-device is the fastest-moving bridge and exports Maestro YAML.

### Cited Findings

#### Comparison table (GitHub API, 2026-10-18)

| Tool | Repo / license | Lang | Stars | Latest release | Contributors | Perception | MCP | Platforms |
|---|---|---|---|---|---|---|---|---|
| Maestro | [mobile-dev-inc/Maestro](https://github.com/mobile-dev-inc/Maestro), Apache-2.0 | Kotlin | 16,111 | cli-2.11.0, 2026-09-29 | 100+ | View hierarchy; screenshots for AI commands | Built into CLI (`maestro mcp`) | Android emu, iOS sim, web |
| Arbigent | [takahirom/arbigent](https://github.com/takahirom/arbigent), Apache-2.0 | Kotlin | 651 | 0.89.0, 2026-09-25 | 5 | Filtered UI tree; annotated screenshots fallback | MCP client (consumes external MCP servers) | Android, iOS (XCTest), web (untested) |
| Midscene | [web-infra-dev/midscene](https://github.com/web-infra-dev/midscene), MIT | TS | 15,313 | v1.16.0, 2026-10-16 (v1.0.0 2025-12-18) | 86 | Screenshot/vision | Not on README; ships "Midscene Skills" | Web, Android (adb), iOS (WDA), HarmonyOS, desktop |
| Mobilerun (ex-DroidRun) | [droidrun/mobilerun](https://github.com/droidrun/mobilerun), MIT | Python | 9,685 | v0.7.0, 2026-10-14 | 31 | A11y tree + screenshots; `--vision-only` | Not on README | Android (Portal app), iOS (iOS Portal) |
| mobile-mcp | [mobile-next/mobile-mcp](https://github.com/mobile-next/mobile-mcp), Apache-2.0 | TS | 9,727 | 1.0.11, 2026-10-14 | 33 | A11y tree first; screenshot+coords fallback | Is an MCP server (stdio + Streamable HTTP) | Android emu/real, iOS sim/real |
| agent-device (Callstack) | [callstack/agent-device](https://github.com/callstack/agent-device), MIT | TS | 5,067 | v0.21.28, 2026-10-15 | 74 | A11y snapshots with refs; screenshots as evidence/fallback | CLI + MCP (`agent-device mcp`) + Node API | iOS, Android, HarmonyOS, TV, web, macOS, Linux |
| appium-mcp | [appium/appium-mcp](https://github.com/appium/appium-mcp), Apache-2.0 | TS | 498 | v1.97.1, 2026-10-12 | 32 | Page source XML; opt-in vision (`appium_ai`) | Is an MCP server | Android (UiAutomator2), iOS (XCUITest) |
| Appium | [appium/appium](https://github.com/appium/appium), Apache-2.0 | TS | 22,094 | (active, pushed 2026-10-18) | 100+ | WebDriver page source | via appium-mcp | Android, iOS, more |
| mobile-use (Minitap) | [minitap-ai/mobile-use](https://github.com/minitap-ai/mobile-use), Apache-2.0 | Python | 3,274 | v3.3.0, 2026-01-12 (pushed 2026-10-14) | 17 | Relies on a11y tree (README notes games fail without it) | README links an "mcp-server" doc section; not verified | Android; iOS simulators only |
| AutoMobile | [kaeawc/auto-mobile](https://github.com/kaeawc/auto-mobile) (same description also at [zillow/auto-mobile](https://github.com/zillow/auto-mobile), last push 2026-03-10), Apache-2.0 | TS | 52 (zillow: 80) | 0.0.86, 2026-10-16 | 19 | n/a (not researched further) | "an MCP and libraries for test authoring & execution" | n/a |
| mobilewright | [mobile-next/mobilewright](https://github.com/mobile-next/mobilewright), Apache-2.0 | TS | 433 | v0.0.67, 2026-10-18 | n/a | Deterministic API | n/a | iOS/Android real, emu, sim |
| AskUI Python SDK | [askui/python-sdk](https://github.com/askui/python-sdk), MIT | Python | 556 | v0.48.0, 2026-10-14 | 10 | Vision | n/a | Desktop, mobile, HMI |
| Kaspresso | [KasperskyLab/Kaspresso](https://github.com/KasperskyLab/Kaspresso), Apache-2.0 | Kotlin | 1,931 | 1.6.1, 2026-04-08 | 55 | Scripted (no AI) | No | Android |
| Detox | [wix/Detox](https://github.com/wix/Detox), MIT | JS | 12,039 | 20.51.3, 2026-05-30 | 100+ | Gray box, scripted | No | Mobile (gray box E2E) |
| uiautomator2 | [openatx/uiautomator2](https://github.com/openatx/uiautomator2), MIT | Python | 8,429 | (pushed 2026-10-18) | n/a | UiAutomator wrapper | No | Android |
| AppAgent (Tencent) | [TencentQQGYLab/AppAgent](https://github.com/TencentQQGYLab/AppAgent), MIT | Python | 6,907 | none; last push 2025-03-19 | n/a | Multimodal | No | Android |
| Mobile-Agent (Alibaba X-PLUG) | [X-PLUG/MobileAgent](https://github.com/X-PLUG/MobileAgent), MIT | Python | 9,312 | no GitHub releases; last push 2026-07-07 | 25 | Multimodal | No | Research family |
| UI-TARS (model) | [bytedance/UI-TARS](https://github.com/bytedance/UI-TARS), Apache-2.0 | Python | 11,617 | last push 2026-01-27 | n/a | Native GUI vision model | n/a | Usable as self-hosted model in Midscene |
| DroidAgent | [coinse/droidagent](https://github.com/coinse/droidagent), **no license file** | Notebook | 79 | last push 2024-03-12 | n/a | Research | No | Android |
| AutoDroid | [MobileLLM/AutoDroid](https://github.com/MobileLLM/AutoDroid), MIT | Python | 500 | last push 2024-03-22 | n/a | Research | No | Android |
| DroidBot | [honeynet/droidbot](https://github.com/honeynet/droidbot), MIT | Python | 990 | last push 2026-08-29 | n/a | UI-tree input generator (non-LLM) | No | Android |
| AndroidWorld (benchmark env) | [google-research/android_world](https://github.com/google-research/android_world), Apache-2.0 | Python | 957 | last push 2026-10-16 | 17 | n/a | n/a | Android |

#### Maestro (deterministic runner, built-in MCP, experimental AI commands)
- MCP server was first added to the CLI in **1.41.0** ("Added Maestro MCP server implementation to cli"), released **2025-06-25**; the brief's "~Apr 2026" matches **2.5.0 (2026-04-27)**, a large MCP improvement release (`list_cloud_devices`, server instructions, clean stdout handshake, official MCP Kotlin SDK 0.11.1) — [CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md); [releases](https://github.com/mobile-dev-inc/Maestro/releases)
- The older standalone Python server [mobile-dev-inc/maestro-mcp](https://github.com/mobile-dev-inc/maestro-mcp) (MIT, 32 stars) is archived, last push 2025-06-23 — GitHub API
- MCP tools: `list_devices`, `inspect_screen` (view hierarchy as JSON), `take_screenshot`, `run` (inline YAML, files, or directory with tags; validates syntax every call), `cheat_sheet`, `list_cloud_devices`, `run_on_cloud`, `get_cloud_run_status`, `open_maestro_viewer`; stdio; login only for cloud tools; no tool uses AI internally, the calling agent is the AI — [Maestro MCP docs](https://docs.maestro.dev/get-started/maestro-mcp)
- 2.7.0 (2026-07-20): `maestro chat` discontinued in favour of Maestro MCP; per-flow artifact bundle with manifest, device logs and **crash/ANR reports**; screenshot before every step plus view hierarchy on failure; detects native SIGSEGV crashes on Android — [CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md)
- 2.6.0: MCP `take_screenshot` downscales to 2000px; 2.0.0: MCP view hierarchy output reduced 50% — [CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md)
- 2.11.0 (2026-09-29): Android 17 (API 37) in `start-device`; **physical iPhones no longer listed; runs fail with "Physical iOS devices are not yet supported"** — [CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md)
- AI commands (experimental): `assertWithAI` and `assertNoDefectsWithAI` added in 1.39.0 (released 2024-10-16), `extractTextWithAI` in 1.39.7; they send a screenshot to an LLM; bring your own OpenAI or Anthropic key — [assertWithAI docs](https://docs.maestro.dev/reference/commands-available/assertwithai); [assertNoDefectsWithAI docs](https://docs.maestro.dev/reference/commands-available/assertnodefectswithai); [extractTextWithAI docs](https://docs.maestro.dev/reference/commands-available/extracttextwithai)
- Maestro Framework open source and free; Basic tier lists Maestro Studio, "Maestro GPT" and AI commands; Cloud tier $250 per parallel device per month; Enterprise custom — [maestro.dev/pricing](https://www.maestro.dev/pricing) (page feature lists looked jumbled to the fetcher; what "Maestro GPT" does was not confirmed)
- 1.32.0 (2023-09-06) already announced "Support writing Flows using AI" — [CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md)

#### Arbigent
- Breaks goals into dependent scenarios; perception = simplified/filtered UI tree, annotated screenshots when accessibility data is missing; apps can add `[[aihint:...]]` labels for the model — [README](https://github.com/takahirom/arbigent)
- Providers: OpenAI (default `gpt-4.1`, `gpt-4o-mini` cheaper), Gemini, Azure OpenAI, Anthropic, any OpenAI-compatible API incl. Ollama — [README](https://github.com/takahirom/arbigent)
- CLI `arbigent run` with `--scenario-ids`, `--tags`, `--dry-run`, `--shard`; writes `arbigent-result/result.yml` + HTML report + screenshots; README includes a GitHub Actions example with an Android emulator runner — [README](https://github.com/takahirom/arbigent)
- iOS supported on simulators and physical devices via XCTest; web listed but "testing has not yet been conducted" — [README](https://github.com/takahirom/arbigent)

#### Midscene (ByteDance web-infra)
- "Locates elements by their appearance and position"; screenshot-based actions "avoid sending large DOM trees to the model" — [README](https://github.com/web-infra-dev/midscene)
- Android via adb (scrcpy optional); secure screens (password fields) can produce black screenshots; JS SDK `@midscene/android` (`aiAct`, `aiQuery`, `aiWaitFor`, `aiAssert`), YAML, `midscene-android` CLI — [Android docs](https://midscenejs.com/android-introduction)
- Supported models listed: Qwen3.x, Doubao-Seed-2.1, DeepSeek V4 Flash, GLM-4.6V, gemini-3.5-flash, UI-TARS; open-source models incl. UI-TARS can be self-hosted — [README](https://github.com/web-infra-dev/midscene)

#### Mobilerun (renamed from DroidRun)
- `github.com/droidrun/droidrun` now resolves to `droidrun/mobilerun` (GitHub API rename redirect); README describes "an open-source framework for controlling Android and iOS devices with LLM agents"; reason for the rename not stated — [README](https://github.com/droidrun/mobilerun)
- Android control through the Portal app (UI tree, screenshots, input); `--vision` and `--vision-only`; providers OpenAI, Anthropic, Gemini, xAI, Ollama, DeepSeek, OpenRouter, OpenAI-compatible; CLI can "replay macros"; "saved trajectories" in tracing; README badge "Benchmark 91.4%" (benchmark not named on the README); Mobilerun Cloud (hosted devices) with no pricing on README — [README](https://github.com/droidrun/mobilerun)

#### mobile-mcp (mobile-next)
- Accessibility-first; "screenshots + coordinates only when needed"; no vision model in the primary path; tools cover devices, app install/launch, taps/swipes/typing, screen recording, **logs and crash reports**, batch commands; Streamable HTTP mode (`--listen`) with optional bearer auth; telemetry via PostHog and Scarf unless `MOBILEMCP_DISABLE_TELEMETRY` is set; no replay or test generation, README points to **mobilewright** for "repeatable, deterministic tests"; paid Mobile Next Cloud for real devices — [README](https://github.com/mobile-next/mobile-mcp)

#### Callstack agent-device
- Agents read accessibility snapshots; elements addressed by refs (valid only in the latest output); snapshot diffs after `--settle` with `+`/`-`/`=` markers; screenshots/video as evidence or fallback — [README](https://github.com/callstack/agent-device)
- CLI, MCP (stdio), typed Node API; working steps saved as `.ad` scripts for CI; **runs exportable as strict Maestro YAML**; captures screenshots, video, logs, traces, network, perf samples, **crash details**, React profiles; supports native iOS/Android plus React Native, Expo, Flutter; remote device clouds (BrowserStack, AWS Device Farm, TestMu AI, Limrun); sessions scoped to git worktrees with device claims; Node 22.12+ — [README](https://github.com/callstack/agent-device)

#### appium-mcp
- Tools incl. `generate_locators`, `appium_get_page_source` (XML inline or saved and filtered by XPath), `appium_screenshot`, `appium_ai` (opt-in vision: compressed screenshot to a vision model, default `Qwen3-VL-235B-A22B-Instruct`, suggested gemini-3-flash-preview; results cached 5 min), `appium_generate_tests` (Java/TestNG, Page Object templates); README warns against exposing it to untrusted users or as a shared service; needs Node 22+, JDK, Android SDK or Xcode — [README](https://github.com/appium/appium-mcp)

#### mobile-use (Minitap)
- Per-role model config via `llm-config.override.jsonc`; providers OpenAI, Google, xAI, OpenRouter, MiniMax, Anthropic; local/open models via OpenAI-compatible endpoint; iOS only on simulators on macOS (Xcode + idb-companion); Docker quick launch Android-only; claims "the first to have completed 100% of the AndroidWorld benchmark" citing arXiv 2602.07787 — [README](https://github.com/minitap-ai/mobile-use) (vendor claim)

### Inferences
- Activity and licensing make Maestro, mobile-mcp, agent-device, Midscene, Mobilerun and appium-mcp viable dependencies; all are Apache-2.0 or MIT. DroidAgent has no license file, so its code cannot be reused, only its ideas.
- AppAgent (no push since 2025-03), AutoDroid and DroidAgent (no push since 2024-03) are dormant research code; useful for ideas, not as dependencies.
- Arbigent has 5 contributors; strong design ideas, but a bus-factor risk as a default dependency.
- Maestro dropping physical iPhones (2.11.0) is not a blocker for a CI tool that uses simulators, but it is a signal that iOS depth varies across these tools.

### Gaps
- Mobilerun: why it was renamed, which benchmark the 91.4% badge refers to, and whether it ships an MCP server were not on the README.
- Midscene: whether an Android MCP server still exists in v1.x (older versions had MCP packages) is unverified.
- AutoMobile (Zillow origin) was not researched beyond repo metadata.
- Repeato and Revyl were not researched; no data collected.

## 2. Commercial offerings: pricing, closed vs open, strengths

### Takeaway
Google has two first-party AI options (the Firebase App Testing agent, free in preview at 200 tests/month, and Android Studio Journeys, in preview), both closed. Note that **Firebase Test Lab (Robo) is deprecated and shuts down 2027-09-30**. Startups (GPT Driver, Minitap, Autosana, Quash, QA Wolf, AskUI) are closed SaaS; published prices run from €49/month (AskUI) to around $500–2,000/month (Autosana, Minitap). None expose an open driver a generic OSS tool could embed.

### Cited Findings
- **Firebase App Testing agent** (Gemini in Firebase, App Distribution): preview, opt-in, no SLA; free during preview within **200 tests per month per project** (each test case on each device counts); tests in natural language as steps with goal, optional hint and final screen assertion, stored as YAML or in console; perception = **screenshots plus accessibility information**; CI via Firebase CLI `apptesting:execute`, Gradle plugin, fastlane; no GitHub Action mentioned; Android only on this page; 5-minute timeout per test; supported actions tap, text, swipe, long press, drag-and-drop, back, wait; blocked by `FLAG_SECURE`; "Random crawl" via Automated Tester — [Firebase docs, updated 2026-10-16](https://firebase.google.com/docs/app-distribution/android/app-testing-agent)
- **Firebase Test Lab / Robo**: crawls UI hierarchy, falls back to Monkey actions for non-widget screens; "given the same device configuration and settings, Robo repeats the same actions in the same order"; outputs logs, annotated screenshots, video, crawl graph; **"Firebase Test Lab is deprecated and will shut down on September 30, 2027"**, migration to Developer Device Platform on Google Cloud recommended — [Robo docs](https://firebase.google.com/docs/test-lab/android/robo-ux-test)
- Test Lab pricing: virtual devices free up to 60 min/day then $1/device/hour; physical free up to 30 min/day then $5/device/hour — [Firebase pricing](https://firebase.google.com/pricing)
- **Android Studio Journeys**: preview via Studio Labs from Android Studio Otter 3 Feature Drop 2025.2.3; XML journey files; "screenshots are sent to Gemini at each action" (no accessibility tree mentioned); NL assertions; runs from the Android CLI; AGP 9.0.0+ (or `JOURNEYS_CUSTOM_APP_ID` for pre-installed apps); unsupported or inconsistent: long-press, double-tap, rotation, memory across steps, counting, conditionals; all permissions granted by default; caching and pricing not documented — [developer.android.com](https://developer.android.com/studio/gemini/journeys)
- **GPT Driver (MobileBoost, YC)**: AI mobile E2E testing; named customers Duolingo, Spotify, Netflix, Salesforce, Groupon — [YC profile](https://ycombinator.com/companies/mobileboost); docs list natural-language tests, "SDK-enhanced native test code" generation, GitHub Actions/Bitrise triggers, API, QA Studio, real devices — [docs.mobileboost.io](https://docs.mobileboost.io); [Test Agent overview](https://docs.mobileboost.io/test-agent/overview). No published price; third-party listings conflict on whether a free tier exists — [G2](https://ai.g2.com/marketplace/tools/gpt-driver) (aggregator, unverified)
- **Minitap** (commercial wrapper around mobile-use): Solo $510/mo (4,800 credits, 2 devices), Team $850/mo on English page ($1,020 on French page), Scale $2,040/mo, Enterprise custom; "no seat fees and no build fees" — [minitap.ai/pricing (de)](https://www.minitap.ai/de/pricing); locale pages disagree, so verify
- **Autosana**: from $500/month, usage-based, no free tier, demo required (vendor blog) — [Autosana blog](https://blog.autosana.ai/appium-vs-autosana-ai-testing-comparison); raised $3.2M in Feb 2026 — [SiliconANGLE](https://siliconangle.com/2026/02/17/autosana-lands-3-2m-automate-mobile-web-ui-testing-agentic-ai/)
- **Quash** (engine "Mahoraga"): tiers by test minutes: Starter $99/mo (800 min), Growth $399/mo (3,500), Pro $899/mo (9,000), free trial 100 min — [quashbugs.com/llms.txt](https://quashbugs.com/llms.txt) (vendor); contradicted by a credits/pay-as-you-go description in [Dynamic Business](https://dynamicbusiness.com/ai-tools/quash-ai-mobile-testing-simplified.html)
- **AskUI**: Free 500 asks/month; €49/1,000; €149/5,000; €549/30,000 per month; Enterprise per seat — [askui.com/pricing](https://askui.com/pricing). Third-party aggregator lists askui at 94.8% on AndroidWorld — [benchmarklist.com](https://benchmarklist.com/benchmarks/androidworld/) (aggregator, unverified)
- **QA Wolf**: fresh Android emulator per run, discarded afterwards — [QA Wolf docs](https://docs.qawolf.com/qawolf/mobile/android-devices); markets turning prompts into deterministic Playwright and Appium tests, human-reviewed — [QA Wolf](https://www.qawolf.com/service/mobile-application-testing-company); per-test pricing, ACV estimated $100K–200K — [Sacra](https://sacra.com/research/qa-wolf) (third-party estimate)
- **Maestro Cloud**: $250 per parallel device per month — [maestro.dev/pricing](https://www.maestro.dev/pricing)

### Inferences
- The Firebase App Testing agent is the closest commercial analogue to the planned tool's "AI explores, then replays" loop, but it is Android-only, preview-quota-limited, and tied to App Distribution and Google's device fleet; it cannot run against a local emulator with deterministic local backend state the way a PR action needs.
- Do not build on Robo/Test Lab: shutdown date 2027-09-30 is within the planned tool's first year or two.
- Journeys is Gemini-only and needs AGP 9; useful as a design reference (XML goals with NL assertions) but not as a pluggable driver.
- Pricing of commercial agents ($500+/month) puts them outside "free GitHub Action" territory; the OSS tool's niche is BYO-model, run-on-the-runner.

### Gaps
- GPT Driver's execution model (deterministic commands vs AI steps, caching, self-healing) and price: the fetched docs pages did not describe them.
- Firebase App Testing agent: post-preview pricing and iOS availability not stated.
- Journeys: model/tier, cost, and exact CLI syntax not on the page.
- QA Wolf Series B date: a search snippet dated it Feb 2026 via a Scale VP press page that I did not open; unverified.

## 3. Determinism: "AI explores once, replays deterministically"

### Takeaway
The pattern is now mainstream and appears in at least six tools, in three variants: (1) **cache AI actions and replay with AI fallback** (Firebase App Testing agent, Arbigent `replayWithFallback`, Midscene plan cache); (2) **AI emits a deterministic script that a plain runner executes** (agent-device `.ad` and Maestro YAML export, QA Wolf Playwright/Appium code, appium-mcp Java/TestNG, Maestro MCP's agent-writes-YAML loop); (3) **deterministic crawl** with no AI (Robo). Assertions are deliberately kept outside the cache: Firebase and Midscene both re-run AI assertions every time.

### Cited Findings
- Firebase App Testing agent: "successful runs cache actions per device"; later runs replay them for repeatability "still using AI to check assertions"; if replay fails it falls back to AI for all actions; results label each step as AI action, replayed action or AI assertion; Google states the agent is non-deterministic and "may take different actions while following the same instructions" — [Firebase docs](https://firebase.google.com/docs/app-distribution/android/app-testing-agent)
- Arbigent: AI result caching when UI tree and goal are identical; `replayWithFallback` replays recorded actions for previously passed scenarios and sends only drifted tasks back to the AI; Maestro YAML flows can run as initialization steps; `type: Execution` reusable scenarios can run with zero AI calls; replay reduces AI cost but not wall-clock time — [README](https://github.com/takahirom/arbigent)
- Midscene: caches **planning** for `ai`/`aiAct` (prompt is the key) and **element XPaths** for `aiLocate`/`aiTap` (web only, DOM-dependent); `aiBoolean`, `aiQuery`, `aiAssert` never cached; strategies read-write / read-only / write-only; stored as `./midscene_run/cache/*.cache.yaml`; on a failed cached plan it re-plans and clears the stale record; "caching speeds up execution but isn't a way to ensure long-term script stability"; CI misses unless cache files are committed; example 51s without cache vs 28s with a hit — [Midscene caching docs](https://midscenejs.com/caching)
- agent-device: working steps saved as `.ad` scripts replayable in CI; runs exportable as strict Maestro YAML — [README](https://github.com/callstack/agent-device)
- Mobilerun: CLI can "replay macros"; tracing saves trajectories; no determinism claim — [README](https://github.com/droidrun/mobilerun)
- mobile-mcp: no replay; defers to mobilewright for "repeatable, deterministic tests" — [README](https://github.com/mobile-next/mobile-mcp)
- appium-mcp: `appium_generate_tests` emits Java/TestNG code with Page Object templates; no self-healing described — [README](https://github.com/appium/appium-mcp)
- Maestro MCP: `run` accepts inline YAML and validates syntax on each call, so the coding agent iterates on a YAML flow until it passes, then the flow is a normal deterministic Maestro test — [Maestro MCP docs](https://docs.maestro.dev/get-started/maestro-mcp)
- QA Wolf: AI turns prompts into "deterministic Playwright & Appium tests", reviewed by humans — [QA Wolf](https://www.qawolf.com/service/mobile-application-testing-company)
- Robo: same config gives same action sequence — [Robo docs](https://firebase.google.com/docs/test-lab/android/robo-ux-test)
- Analogous web-side pattern (not mobile): "AI fallback keeps today's run on track" and self-healing proposes an updated workflow as a draft awaiting approval — [Anchor Browser docs](https://docs.anchorbrowser.io/advanced/self-healing)

### Inferences
- For a base-vs-head PR comparison, the strongest design is: explore on **base** (or reuse a committed script), freeze the resulting action list as a Maestro-style script, then replay the same script on **head**. Divergence on head (a selector no longer found, a different screen) is itself the signal worth reporting, rather than letting the AI silently "heal" around it.
- Keep healing as a proposal (draft script update in the PR comment), never as a silent pass; Anchor's draft-and-approve model and Arbigent's "only drifted tasks go back to AI" are the two ideas to port.
- Commit caches/scripts to the repo: Midscene notes CI only hits the cache if cache files are committed; the same will hold for any replay store.
- Maestro YAML is emerging as the interchange format: agent-device exports it and Arbigent consumes it. Using it as the tool's replay format gets two exporters for free.

### Gaps
- No tool publishes a measured replay success rate (how often a cached plan survives a typical PR); found no data.
- GPT Driver's caching/self-healing approach is undocumented in what I could fetch.

## 4. Oracles: how bugs are decided, and known accuracy, false-positive and flakiness data

### Takeaway
Production tools use four oracles: crash/ANR detection (cheap, reliable), explicit assertions (element or final-screen), pixel visual diff (Maestro `assertScreenshot`, default 95% match), and LLM judgement (`assertWithAI`, `aiAssert`, Firebase final-screen assertion, Arbigent image assertions). Vendors treat LLM judgement as unstable: Maestro makes AI assertions **non-blocking by default**. Academic LLM testers find few non-crash bugs, and no tool or paper I found publishes a false-positive rate for LLM assertions in CI.

### Cited Findings
- Maestro `assertWithAI` and `assertNoDefectsWithAI` default to `optional: true` "to prevent unstable AI responses from breaking CI/CD pipelines"; `optional: false` makes them blocking; `assertNoDefectsWithAI` checks for cut-off, overlapping or off-centre elements — [assertWithAI docs](https://docs.maestro.dev/reference/commands-available/assertwithai); [assertNoDefectsWithAI docs](https://docs.maestro.dev/reference/commands-available/assertnodefectswithai)
- Maestro `assertScreenshot`: compares against a reference image, `thresholdPercentage` default 95, `cropOn` selector; docs suggest tuning threshold per environment or device; reference update flow not documented — [assertScreenshot docs](https://docs.maestro.dev/reference/commands-available/assertscreenshot)
- Maestro 2.7.0 artifacts include crash/ANR reports and detect native SIGSEGV crashes — [CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md)
- Firebase App Testing agent: pass/fail from AI-evaluated final screen assertions, prerequisite failure, or 5-min timeout; known weak spots: steps needing many actions, scrolling without visual cue, counting — [Firebase docs](https://firebase.google.com/docs/app-distribution/android/app-testing-agent)
- Arbigent `imageAssertions` build on Roborazzi's AI image assertion; the model re-evaluates if its first decision is doubtful; Anthropic assertions use forced tool-use — [README](https://github.com/takahirom/arbigent)
- mobile-mcp exposes logs and crash reports as tools; agent-device captures crash details, logs, network and perf — [mobile-mcp](https://github.com/mobile-next/mobile-mcp); [agent-device](https://github.com/callstack/agent-device)
- **VisionDroid** (multimodal LLM; Explorer/Monitor/Detector agents) targets non-crash functional bugs; evaluated on 590 non-crash bugs; abstract versions differ on baseline counts — [arXiv 2407.03037](https://arxiv.org/abs/2407.03037v1); ICSE 2026 journal-first — [ICSE 2026](https://conf.researchr.org/details/icse-2026/icse-2026-journal-first-papers/26/Seeing-is-Believing-Vision-driven-Non-crash-Functional-Bug-Detection-for-Mobile-Apps)
- **GraphDroid** (arXiv 2609.10031, 2026-09-09): 41 apps, six baselines, up to 36.4% more code coverage, 19 bugs (7 new, 4 fixed), 13 of 52 Themis crashes (most of any tool); in its manual check of non-crash bugs VisionDroid found 1, DroidAgent 3, GPTDroid 0, GraphDroid 6 — [arXiv abs](https://arxiv.org/abs/2609.10031); [PDF](https://arxiv.org/pdf/2609.10031) (numbers via search snippet of the PDF)
- **DroidAgent** (ICST 2024): ~61% average activity coverage on 15 Themis apps vs ~51% for prior tools — [arXiv 2311.08649](https://arxiv.org/abs/2311.08649v1); [Chalmers](https://research.chalmers.se/en/publication/542878)
- **AUITestAgent**: 94% verification accuracy on the authors' own benchmark; Meituan deployment found 4 new functional bugs in 10 regression runs over two months — [arXiv 2407.09018](https://arxiv.org/abs/2407.09018v1) (self-reported)
- **LLMDroid** (FSE 2025): +26.16% code coverage and +29.31% activity coverage on 14 Play apps when used as guidance for existing tools — [Crossref](https://api.crossref.org/works/10.1145%2F3715763)
- **AndroidWorld** is near saturation: aggregators show top pass@1 of 97.4% (mostly single-trial entries) — [benchmarklist.com](https://benchmarklist.com/benchmarks/androidworld/) (aggregator, unverified); AGI-0 claimed 97.4% as of 2025-10-08 — [theagi.company](https://www.theagi.company/blog/android-world) (vendor); Minitap claims 100% — [mobile-use README](https://github.com/minitap-ai/mobile-use) (vendor); MobileWorld (ACL 2026) says >90% indicates saturation and its harder benchmark drops the best framework to 51.7% — [benchmarklist.com MobileWorld](https://benchmarklist.com/benchmarks/mobileworld/) (aggregator)

### Inferences
- For an **advisory** PR comment, the oracle stack should be ordered by trust: crash/ANR/fatal logcat (hard signal) > deterministic assertion or replay divergence > pixel diff base vs head > LLM judgement (label as "AI opinion", never fail the check on it). This mirrors Maestro's optional-by-default choice.
- Base-vs-head pixel diff on the same emulator image and same seeded backend is a cheaper and more defensible visual oracle than `assertNoDefectsWithAI`; LLM can then be used only to describe or triage a diff it did not decide.
- AndroidWorld scores measure task completion, not bug-finding precision; they say little about false positives in a regression oracle.

### Gaps
- No published false-positive or flake rate for `assertWithAI`, `aiAssert`, Firebase AI assertions or Journeys assertions.
- GPTDroid's and Guardian's own numbers were not retrieved (only GraphDroid's comparison data).
- Official AndroidWorld leaderboard spreadsheet could not be fetched (Google Sheets export blocked); leaderboard figures above are from aggregators and vendors.

## 5. Token/LLM cost per screen or run; local/open model options

### Takeaway
Reported costs are small per step but wildly different by method: about $0.005/step with GPT-4o (Arbigent's estimate), $0.59 for 58 tasks with a cheap Chinese VLM (Midscene), versus ~$12 per app for full LLM exploration (DroidAgent, as measured by GraphDroid) against ~$1.41 for a hybrid heuristic+LLM explorer. Caching/replay and accessibility-tree perception are the main levers. Every leading OSS agent accepts an OpenAI-compatible endpoint, so local models (Ollama, self-hosted UI-TARS or Qwen-VL) are a configuration choice, not a fork.

### Cited Findings
- Arbigent author estimate: ~$0.005 per step, ~$0.02 per task with GPT-4o; replay cuts per-step AI cost for passing scenarios — [README](https://github.com/takahirom/arbigent)
- Midscene: Doubao Seed 2.1 Turbo passed 58 of 60 AppControlBench tasks for $0.59 total model cost — [README](https://github.com/web-infra-dev/midscene)
- GraphDroid measured DroidAgent at ~$11.97 per app, GraphDroid ~$1.41 per app (under one eighth of the best pure-LLM baseline), LLMDroid ~$0.75 per app, ~5.33 s per action — [arXiv 2609.10031 PDF](https://arxiv.org/pdf/2609.10031) (via search snippet)
- LLMDroid hourly cost: ACM version says $0.49/h with GPT-4o and $0.03/h for an alternative reaching 94% — [Crossref](https://api.crossref.org/works/10.1145%2F3715763); contradicted by the FSE listing: $4.77/h and $0.18/h at 78% — [FSE 2025](https://conf.researchr.org/details/fse-2025/fse-2025-research-papers/99/LLMDroid-Enhancing-Automated-Mobile-App-GUI-Testing-Coverage-with-Large-Language-Mod)
- Firebase App Testing agent: no model cost to the user during preview, capped at 200 tests/month/project — [Firebase docs](https://firebase.google.com/docs/app-distribution/android/app-testing-agent)
- Maestro MCP payload trimming: view hierarchy output cut 50% (2.0.0), screenshots downscaled to 2000px (2.6.0) — [CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md)
- Local/open model options: Arbigent supports Ollama via OpenAI-compatible API — [Arbigent](https://github.com/takahirom/arbigent); Mobilerun supports Ollama — [Mobilerun](https://github.com/droidrun/mobilerun); mobile-use supports any OpenAI-compatible endpoint — [mobile-use](https://github.com/minitap-ai/mobile-use); Midscene lists UI-TARS as self-hostable — [Midscene](https://github.com/web-infra-dev/midscene); appium-mcp vision defaults to Qwen3-VL via configurable base URL — [appium-mcp](https://github.com/appium/appium-mcp); UI-TARS repo is Apache-2.0 — [bytedance/UI-TARS](https://github.com/bytedance/UI-TARS)

### Inferences
- A PR run that replays a committed script and only calls an LLM for drifted steps or for describing diffs should cost cents, not dollars; full exploration per PR is where the dollars go.
- Accessibility-tree perception (mobile-mcp, agent-device, Maestro `inspect_screen`) keeps tokens down and works on a CPU-only CI runner; vision-only (Midscene, Journeys) needs a VLM per step.
- The tool should take a single OpenAI-compatible base URL + key + model name, which covers hosted APIs and local models alike.

### Gaps
- No primary source gives tokens per screen for a11y-tree vs screenshot perception on Android.
- No cost figures found for Mobilerun, mobile-use or agent-device runs.

## 6. Best default driver and the interface that keeps drivers pluggable

### Takeaway
Use **Maestro as the default deterministic execution and replay substrate** (Apache-2.0, 16k stars, monthly releases, Android-first, emulator/simulator CLI, JUnit/HTML reports, crash/ANR artifacts, `assertScreenshot`, built-in MCP). For the AI exploration step, drive the device through an **MCP server** so the model side is swappable; Maestro MCP, mobile-mcp and agent-device are the three credible stdio MCP bridges. Keep the tool's own contract small: MCP for exploration, a script file (Maestro YAML) for replay, and a CLI for CI.

### Cited Findings
- Maestro ships the MCP server inside the CLI (`maestro mcp`, stdio) with `inspect_screen`, `take_screenshot`, `run` (YAML), and replaced its own `maestro chat` with MCP in 2.7.0 — [Maestro MCP docs](https://docs.maestro.dev/get-started/maestro-mcp); [CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md)
- agent-device offers the same command set three ways (CLI, MCP stdio, typed Node API) and exports Maestro YAML — [README](https://github.com/callstack/agent-device)
- mobile-mcp offers stdio and stateless Streamable HTTP with bearer auth, Android and iOS, real and virtual devices — [README](https://github.com/mobile-next/mobile-mcp)
- Arbigent is an MCP **client** (pulls in external MCP servers for install, logs, debug data) and can run Maestro YAML as setup — [README](https://github.com/takahirom/arbigent)
- appium-mcp is the option when an app already has Appium infrastructure; vision is opt-in — [README](https://github.com/appium/appium-mcp)
- iOS depth differs: Maestro rejects physical iPhones as of 2.11.0 — [CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md); mobile-use iOS is simulator-only — [README](https://github.com/minitap-ai/mobile-use); mobile-mcp and agent-device cover simulators and real devices — [mobile-mcp](https://github.com/mobile-next/mobile-mcp); [agent-device](https://github.com/callstack/agent-device)
- React Native/Flutter: agent-device explicitly supports RN, Expo and Flutter — [README](https://github.com/callstack/agent-device); Maestro resolves Flutter web semantics identifiers (2.7.0) — [CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md); Detox is a scripted gray-box E2E framework (no AI) — [wix/Detox](https://github.com/wix/Detox)

### Inferences
- Proposed driver contract (ideas ported from the tools above): `devices()`, `snapshot()` (a11y tree with stable refs, agent-device style), `screenshot()`, `act(tap|type|swipe|back|launch)`, `logs()`/`crashes()`, and `export_script()` to Maestro YAML. Each of Maestro MCP, mobile-mcp and agent-device can back it with a thin adapter; Midscene/Mobilerun/mobile-use fit as "autonomous agent" plug-ins that consume the same device and hand back a script.
- Prefer MCP over a bespoke plugin API for the exploration side: it is the one interface all three bridges and Maestro already speak, and it lets the user's choice of model or coding agent drive the session. Prefer the CLI + YAML for the replay side: no LLM, no MCP client, reproducible on base and head.
- Ideas worth porting: agent-device's snapshot diffs (`+`/`-`/`=`) as the "what changed on this screen" primitive for base-vs-head; Arbigent's `[[aihint:...]]` app-side hints and replay-only-drifted-steps; Firebase's step schema (goal, hint, final assertion) and its labelling of each step as AI vs replayed; Midscene's committed `.cache.yaml` and never-cache-assertions rule; Maestro's optional-by-default AI assertions.
- Still unsolved in every tool reviewed: deciding which screens a diff affects (none map code changes to screens), making AI judgements trustworthy enough to gate a merge, and keeping AI exploration identical between base and head so the diff reflects the code, not the agent.

### Gaps
- No standard MCP tool schema for mobile devices exists across Maestro MCP, mobile-mcp, agent-device and appium-mcp; each names tools differently, so an adapter per server is needed. I found no effort to standardise it.
- No head-to-head reliability comparison of the MCP bridges on CI emulators (e.g. GitHub-hosted runners) was found.
