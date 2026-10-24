# CI device infrastructure, cost, and runtime signal capture for a PR device testing tool (Android first, iOS later)

Research date: 2026-10-18. All prices in USD as shown on the cited page on that date unless stated. "First-party CI data" means timings pulled with `gh api` from the public repo bwhtech/helpdesk_mobile, which already runs an Android emulator job on every PR with reactivecircus/android-emulator-runner.

## 1. Android emulators in GitHub Actions: runners, android-emulator-runner, ATD, GMD, boot and test times, flakiness

### Takeaway
Android emulators run well only on GitHub-hosted **Linux x64** runners (KVM after a udev rule); a cold boot of an API 35 google_apis x86_64 image took **25.5 s** on a public-repo `ubuntu-latest` runner, and the whole emulator job (build + SDK install + boot + 10 instrumented tests) took about **6.5 to 7 min**. AVD snapshot caching, the README's headline optimization, was net negative in that data: a 2.3 GB cache restore took about 29 s and the snapshot was then rejected as incompatible after the emulator auto-updated, so the run cold-booted anyway.

### Cited Findings
**Runner hardware and acceleration**
- Standard runners, public repos: `ubuntu-latest` / `ubuntu-24.04` / `ubuntu-22.04` / `ubuntu-26.04` = 4 CPU, 16 GB RAM, 14 GB SSD, x64; private repos get 2 CPU, 8 GB, 14 GB. `ubuntu-*-arm` = same split on arm64. — [GitHub docs: GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- Only GitHub-hosted **Linux** runners are documented as supporting hardware acceleration for Android SDK tools; the page does not mention it for arm64 or macOS. For arm64 macOS runners: "Nested-virtualization is not supported due to the limitation of Apple's Virtualization Framework." — [GitHub docs: GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- Hardware-accelerated Android virtualization arrived on larger Linux runners in Feb 2023 (a 4-core test ran about 2 to 3x faster) and on standard 2-vCPU Linux runners on 2024-04-02; it requires adding the runner user to the KVM group via a udev rule. — [GitHub changelog 2023-02-23](https://github.blog/changelog/2023-02-23-hardware-accelerated-android-virtualization-on-actions-windows-and-linux-larger-hosted-runners); [GitHub changelog 2024-04-02](https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/)
- No source found confirming `/dev/kvm` on `ubuntu-*-arm` runners; a third-party guide says most CI runners do not expose nested virtualization and suggests Redroid as the no-KVM option (unverified for GitHub). — [Codersera blog](https://codersera.com/blog/android-emulator-docker-without-kvm/amp/)

**reactivecircus/android-emulator-runner**
- Status: latest release **v2.38.0 (2026-07-05)**, last push 2026-08-26, 1,303 stars, 97 open issues+PRs, not archived (GitHub API, queried 2026-10-18). — [repo](https://github.com/ReactiveCircus/android-emulator-runner)
- Defaults: `emulator-options` = `-no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim`; `emulator-boot-timeout` = 600 s; `force-avd-creation` default true; `disable-animations` default true; `target` accepts `aosp_atd` / `google_atd`; `arch` accepts `arm64-v8a` but old ARM emulators are "slow and no longer supported by Google". Ubuntu runners are "2-3 times faster than the macOS ones" and cheaper. — [README](https://github.com/ReactiveCircus/android-emulator-runner)
- Recommended caching flow: cache `~/.android/avd/*` and `~/.android/adb*` keyed by API level; on cache miss boot once without `-no-snapshot` to create a snapshot; test runs add `-no-snapshot-save`. — [README](https://github.com/ReactiveCircus/android-emulator-runner)
- Android docs: Quick Boot from a snapshot can be up to 10x faster than cold boot; snapshots become invalid when the emulator, system image, or AVD settings change; snapshots are not reliable with software rendering enabled. — [Android docs: emulator snapshots](https://developer.android.com/studio/run/emulator-snapshots) (via search summary)

**First-party CI timings (public repo, `ubuntu-24.04` image 20261004, API 35 google_apis x86_64, pixel_6, 2 emulator cores, swiftshader_indirect, emulator 37.2.12.0)** — [run 38678273450](https://github.com/bwhtech/helpdesk_mobile/actions/runs/38678273450); [workflow](https://github.com/bwhtech/helpdesk_mobile/blob/develop/.github/workflows/build.yml)
- Whole `emulator-tests` job: 7m00s, 6m38s, 6m02s across three PR/push runs (2026-10-11 and 2026-10-15).
- `assembleDebug assembleDebugAndroidTest` with Gradle cache: 1m18s to 1m41s.
- AVD cache restore: **~2,277 MB** at 155.7 MB/s, 26 to 29 s including extraction.
- android-emulator-runner SDK setup before boot: **55 s** (licenses 5 s, build-tools/platform 1 s, emulator package 12 s, **system image download 37 s**). The system image is not in the AVD cache.
- Emulator log: `Snapshot file cannot be used, incompatible version` then `The emulator is starting from scratch`, followed by **`Boot completed in 25520 ms`**. Also `Feature QuickbootFileBacked is disabled due to stability issues`.
- `connectedDebugAndroidTest` (install + 10 `@Test` methods): `BUILD SUCCESSFUL in 3m 3s`.

**Automated Test Device (ATD) images and Gradle Managed Devices (GMD)**
- GMD: API 27+; AGP creates, boots, snapshots and tears down devices; caches results and "reruns only tests likely to produce different results"; device groups run in parallel; sharding via `android.experimental.androidTest.numManagedDeviceShards` (3 devices x 2 shards = 6 emulators; can time out if resources are short); CI flag `-Pandroid.testoptions.manageddevices.emulator.gpu=swiftshader_indirect`. — [Android docs: managed devices](https://developer.android.com/studio/test/managed-devices)
- ATD: removes Google apps (Chrome, Play Store, Maps...), Settings app, **SystemUI**, Launcher3, LatinIME and other AOSP apps; disables hardware rendering; "screenshot tests that depend on hardware rendering aren't supported"; docs still say "ATDs currently support only API level 30"; no quantitative CPU/memory savings published. — [Android docs: managed devices](https://developer.android.com/studio/test/managed-devices)
- `google_atd` images exist for API 31, 32, 33 on stable per a Chromium SDK packager commit. — [Chromium commit](https://chromium.googlesource.com/chromium/src/third_party/android_sdk/+/1fb4dd28f9e6b33324efb7c993e8fdb5d2596e74). A CPython testbed commit (mirror) says API 34/35 images "have significant issues with image size and internet connectivity" and API 36+ are not available as `aosp_atd` yet. — [CPython commit mirror](https://remotebranch.eu/Stowage/cpython/commit/6543720b63a62363de540deb5a6701f1ae431bce) (secondary mirror; unverified against upstream). A Bitrise user reported API 34 "only works with aosp_atd". — [Bitrise forum](https://discuss.bitrise.io/t/android-emulator-none-of-the-images-api34-are-working/24122)

**Flakiness sources reported**
- API 36 images: boot wait that polls `init.svc.bootanim` hangs because the property is never populated when the boot animation is disabled; workaround is to wait on boot-completed instead. Single-user report, no official doc. — [CircleCI forum](https://discuss.circleci.com/t/starting-android-emulator-with-api-36-hangs-while-waiting-for-boot-animation-with-workaround/54823)
- "System UI isn't responding" dialog at boot on API 33/34 blocks interaction; no confirmed fix in thread. — [Bitrise forum](https://discuss.bitrise.io/t/android-emulator-shows-dialog-system-ui-isnt-responding-when-it-boots/23381)
- Patrol's CI docs call emulators on GitHub Actions "slow and unstable" and recommend emulator.wtf or Firebase Test Lab. — [Patrol CI platforms](https://patrol.leancode.co/ci/platforms)
- Snapshot invalidation on emulator/system-image change (above) is directly visible in the first-party run: the action installs the latest emulator on `channel: stable` every run, while the cache key `avd-35-google_apis-x86_64-pixel_6` does not include the emulator version. — [run 38678273450](https://github.com/bwhtech/helpdesk_mobile/actions/runs/38678273450)

### Inferences
- Default device host: GitHub-hosted `ubuntu-latest` x64. arm64 Linux and macOS runners should be treated as unsupported for the Android emulator (no documented KVM; nested virtualization explicitly unavailable on arm64 macOS).
- Snapshot caching should be off by default, or keyed on emulator build + system image revision + AVD config. At API 35 a 2.3 GB AVD cache costs ~29 s to restore versus a ~25 s cold boot with KVM, and burns about a quarter of the 10 GB per-repo cache (see section 3). Caching the **system image** (37 s download) plus pinning the emulator version is the better trade.
- Do not use ATD for the before/after screenshot pass: no SystemUI means no status/nav bars, and no hardware rendering diverges from what users see. ATD is acceptable for a fast crash/ANR smoke pass if images exist at the chosen API level.
- Boot readiness should wait on `sys.boot_completed` plus package manager readiness, never `init.svc.bootanim`, and should dismiss or detect system ANR dialogs before the agent starts.
- Base and head on one runner: realistic budget per side is about 25 s boot plus app install plus agent time; two parallel jobs cost nothing extra on public repos but double the ~55 s SDK setup and ~1.5 min build on private repos.

### Gaps
- No published, independent boot-time benchmark for GitHub Actions across API levels (cold vs snapshot) was found; the 25.5 s figure is one run on one image. Private-repo 2 vCPU runner timings not measured.
- ATD availability for API 34 to 36 on the stable channel is unconfirmed (official doc still says API 30 only).
- Whether `ubuntu-24.04-arm` exposes `/dev/kvm` for arm64 system images: no source.

## 2. iOS: macOS runners, simulators, simctl automation, boot times

### Takeaway
iOS simulators run on GitHub's arm64 macOS runners (M1, 3 cores, 7 GB) at **$0.062/min for private repos, about 10x Linux 2-core**, and free for public repos; concurrency is capped at **5 macOS jobs** on Free/Pro/Team plans. Boot-time data is anecdotal (seconds locally, minutes reported on CI), so the tool must poll for readiness and budget several minutes.

### Cited Findings
- macOS runner labels `macos-latest`, `macos-14`, `macos-15`, `macos-26`, `xcode-27`: 3 cores (M1), 7 GB RAM, 14 GB SSD, arm64, same for public and private. Intel labels `macos-15-intel`, `macos-26-intel`: 4 cores, 14 GB. — [GitHub docs: GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- Prices: macOS 3/4-core (M1 or Intel) $0.062/min; `macos_l` 12-core $0.077/min; `macos_xl` 5-core M2 Pro $0.102/min; Linux 2-core x64 $0.006/min. Larger runners are not free for public repos and require Team or Enterprise Cloud. — [GitHub docs: runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)
- Runner usage in public repositories remains free. — [GitHub: 2026 pricing changes](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/)
- macOS concurrency: 5 jobs on Free, Pro and Team; 50 on Enterprise; the limit is shared between standard and larger macOS runners. — [GitHub docs: limits](https://docs.github.com/en/actions/reference/limits)
- Boot time reports: a runner-images issue (early 2024, macOS 14 image) says it "can take 10 minutes or longer to start the iOS simulator" — [actions/runner-images#9591](https://github.com/actions/runner-images/issues/9591); a third-party tool README says GitHub-hosted macOS "can need 4–6 min for a cold start" (unsourced) — [ios-simulator-skill](https://github.com/conorluddy/ios-simulator-skill); local figures of 20 to 40 s first boot and 10 to 20 s later boots appear in an MCP server doc (not CI). — [mcp-mobile-server doc](https://glama.ai/mcp/servers/@cristianoaredes/mcp-mobile-server/blob/1068ec5f3c057bd486294a2f614d80206c28c7d4/docs/examples/ios-workflow.md)
- CircleCI suggests pre-warmed simulator snapshots to avoid first-boot indexing cost on macOS executors. — [CircleCI support](https://testsupport.circleci.com/en/articles/15090412-reducing-ios-simulator-cpu-overhead-on-macos-executors)
- Alternative macOS runner vendor: WarpBuild lists a 6 vCPU / 22 GB macOS ARM runner at $0.08/min (vendor page). — [WarpBuild docs](https://docs.warpbuild.com/ci/cloud-runners); [WarpBuild vs GitHub](https://www.warpbuild.com/compare/github-actions)

### Inferences
- iOS default: `macos-latest` (arm64). Expect a PR run of 15 to 25 macOS minutes (Xcode build dominates) = roughly $0.93 to $1.55 per PR on private repos at $0.062/min, before LLM cost. The 5-job macOS cap means a busy private repo queues; base and head should share one job on iOS.
- Unlike Android, the iOS simulator is not a nested VM, so arm64 runners are the right host; no KVM-equivalent setup step.

### Gaps
- No authoritative, current (2026 image) measurement of `xcrun simctl boot` time on GitHub runners.
- Apple primary docs for `simctl` (boot, `io screenshot`, `io recordVideo`, `status_bar override`) were not fetched in this pass.

## 3. Device clouds, alternative runners, and test runners/sharding (pricing as of Oct 2026)

### Takeaway
Two classes exist: **batch services** that run an instrumentation/Robo suite and return artifacts (Firebase Test Lab, emulator.wtf), which cannot host an interactive LLM agent loop, and **interactive device clouds** reachable over adb/Appium (Genymotion SaaS, BrowserStack, Sauce Labs, TestMu AI, AWS Device Farm, Maestro Cloud). The biggest 2026 change: **Firebase Test Lab is deprecated and shuts down 2027-09-30**, replaced by Google Cloud's Developer Device Platform (DDP).

### Cited Findings
**GitHub-hosted (baseline)**
- Linux x64: 2-core $0.006, 4-core $0.012, 8-core $0.022, 16-core $0.042/min; Linux arm64 2-core $0.005, 4-core $0.008; Linux 4-core GPU $0.052/min. — [GitHub docs: runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)
- Hosted runner prices were cut by up to 39% on 2026-01-01; the planned $0.002/min fee on self-hosted runners (from 2026-03-01) was postponed. — [GitHub: 2026 pricing changes](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/); [GitHub changelog 2025-12-16](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/). Whether the self-hosted fee has since been rescheduled: not found.
- Concurrency: Free 20 jobs, Pro 40, Team 60, Enterprise 500; larger runners up to 1,000. Job limit 6 h. Included minutes: Free 2,000/month, Pro/Team 3,000, Enterprise Cloud 50,000. Cache 10 GB per repo; artifact storage 500 MB (Free) to 50 GB (Enterprise). — [GitHub docs: limits](https://docs.github.com/en/actions/reference/limits)
- Third-party runner vendors (vendor or aggregator pages, unverified): Blacksmith Ubuntu x64 $0.004/min and ARM $0.0025/min with 3,000 free minutes; WarpBuild Linux 2-vCPU $0.004/min; Android emulator/KVM support on these not confirmed. — [Tenki runner showdown 2026](https://tenki.cloud/blog/github-actions-runner-showdown-2026); [Better Stack comparison](https://betterstack.com/community/comparisons/namespace-alternatives/)

**Firebase Test Lab (FTL) and its successor**
- Spark (free): 10 virtual + 5 physical test runs/day. Blaze: virtual $1/device-hour, physical $5/device-hour, after 60 min/day virtual and 30 min/day physical free; billed per minute rounded up, test execution time only. Budget alerts do not cap spend. — [FTL pricing](https://firebase.google.com/docs/test-lab/usage-quotas-pricing) (page updated 2026-10-16)
- Deprecated; full shutdown **2027-09-30**; DDP (Device Run, Device Streaming API, agent skills, Device Catalog) matches FTL rates **until 2027-04-30**, then moves to pay-per-use plus per-device-slot subscription; DDP requires billing. — [FTL migrate FAQ](https://firebase.google.com/docs/test-lab/migrate-faq); [FTL migrate](https://firebase.google.com/docs/test-lab/migrate)
- FTL via GMD plugin `com.google.firebase.testlab` 0.0.1-alpha05: Gradle does not run FTL tests in parallel; `timeoutMinutes` default 15, max 45 physical / 60 virtual; up to 50 shards physical / 100 virtual; `recordVideo` and `performanceMetrics` default false. — [Android docs: managed devices](https://developer.android.com/studio/test/managed-devices)
- Robo test: default timeout 300 s (console) / 900 s (gcloud); falls back to Monkey taps on non-widget screens. — [FTL Robo](https://firebase.google.com/docs/test-lab/android/robo-ux-test)

**emulator.wtf**
- Billing per emulator-minute, rounded up per device-shard, only test runtime billed (upload, boot, teardown free); the only figure on the billing page is an example at $2/emulator-hour (not stated as the list price). — [emulator.wtf billing](https://docs.emulator.wtf/concepts/billing/)
- Vendor claim (relayed by Patrol docs): 2 to 5x faster than FTL and 4 to 20x faster than spawning emulators on CI machines. — [Patrol CI platforms](https://patrol.leancode.co/ci/platforms)
- May 2026: GitHub Action moved to `emulator-wtf/actions@v1.0.0`; up to 10x less time to first test start with very large shard counts. — [emulator.wtf changelog 2026-05-08](https://docs.emulator.wtf/changelog/2026-05-08/)
- Aggregator says $200 to $2,000/month subscriptions plus a limited free version (unverified). — [AlternativeTo](https://alternativeto.net/software/emulator-wtf/about)

**Interactive clouds**
- Genymotion SaaS: pay-as-you-go **$0.06/min per running virtual device**; Unlimited $219/month per device (monthly) or $179/month (annual); Premium custom (GPU, dedicated servers); PaaS images $0.60/hour per instance on cloud marketplaces. — [Genymotion pricing](https://www.genymotion.com/pricing/)
- AWS Device Farm (real devices): $0.17/device-minute; unmetered $250/month per slot (slots = concurrency, separate for Android/iOS and automated/remote access); private devices from $200/month; one-time 1,000 free trial minutes "for a limited time". — [AWS Device Farm pricing](https://aws.amazon.com/device-farm/pricing/)
- Sauce Labs: Virtual Device Cloud (emulators/simulators) $149/month annual or $199 monthly; Real Device Cloud $199 annual / $249 monthly; 1 to 5 concurrent sessions by plan. — [Sauce Labs pricing](https://saucelabs.com/pricing)
- TestMu AI (formerly LambdaTest): Virtual Automation Cloud $139/month (annual); Real Device Automation $199/month (annual); free tier 100 automation minutes lifetime with 2 parallels. — [TestMu AI pricing](https://www.testmuai.com/pricing/)
- Maestro Cloud: $250 per device per month, priced by max concurrent executions; hosted Android, iOS and web devices; local CLI is free and open source. — [Maestro pricing](https://maestro.dev/pricing)
- BrowserStack App Automate: page advertises 35,000+ real devices but App Automate plan prices were not extractable; visible Automate (web) plans run $59 to $225/month annual. — [BrowserStack pricing](https://www.browserstack.com/pricing?product=app-automate)

**Runners and sharding tools (GitHub API, queried 2026-10-18)**
- Flank: last release v23.10.1 (2023-10-26), last push 2026-06-20; FTL-only, so it inherits the 2027 shutdown. — [Flank](https://github.com/Flank/flank)
- Fladle (Gradle wrapper for Flank): v0.20.0 (2026-03-14), last push 2026-10-13. — [Fladle](https://github.com/runningcode/fladle)
- Marathon (Android + iOS runner with sharding, retries, flakiness strategies): 0.10.5 (2026-07-21), last push 2026-09-21. — [Marathon](https://github.com/MarathonLabs/marathon)
- Maestro CLI: cli-2.11.0 (2026-09-29), 16.1k stars. — [Maestro](https://github.com/mobile-dev-inc/Maestro)

### Inferences
- The default backend should be the local GitHub runner emulator; the agent loop needs millisecond-to-second adb round trips, which batch services (FTL, emulator.wtf) do not offer. Batch services fit only an optional "run the app's existing instrumentation suite" lane.
- For an optional remote backend that supports live driving, Genymotion SaaS is the cheapest per-minute option found ($0.06/min, about 10x GitHub Linux 2-core but with no runner-side boot cost); AWS Device Farm at $0.17/min is the per-minute real-device option. Subscription clouds ($139 to $250 per device-month) only pay off at sustained PR volume.
- Avoid building on Flank/Fladle or the FTL API: both are tied to a service with a fixed end date and DDP pricing after 2027-04-30 is unpublished.
- Normalised per-minute comparison: GitHub Linux 2-core $0.006; FTL virtual $0.0167; Genymotion $0.06; GitHub macOS $0.062; AWS Device Farm $0.17.

### Gaps
- BrowserStack App Automate per-parallel price; emulator.wtf list price and OSS program; DDP post-April-2027 rates.
- Whether emulator.wtf or Genymotion SaaS exposes a live adb tunnel usable by an external agent was not verified in this pass (Genymotion's `gmsaas` adb connect is known from memory, not sourced here).
- Marathon and Maestro Cloud per-run timings: none found.

## 4. Self-hosted options: Redroid, docker-android (budtmo), emulator in containers, Waydroid

### Takeaway
budtmo/docker-android wraps the real emulator and needs KVM; Redroid runs Android userspace directly on the host kernel (no VM, no KVM, amd64 and arm64) and packs many instances per host, at the cost of kernel binder requirements and a privileged container. Neither has published CI benchmarks; both are active as of Oct 2026.

### Cited Findings
- budtmo/docker-android: 15,987 stars, release v3.8.0-p1 (2026-10-09), last push 2026-10-14. — [docker-android](https://github.com/budtmo/docker-android) (GitHub API)
- docker-android is VM-based, requires KVM, recommends an Ubuntu host, and ships emulator images for Android 9 to 14 plus a Genymotion image. — [aind comparison list](https://awesome.ecosyste.ms/projects/github.com%2Faind-containers%2Faind); [docker-android overview](https://hamradio.my/run-android-emulators-in-docker-with-ease-using-docker-android/) (secondary)
- Redroid: runs Android userspace on the host kernel without QEMU or virtualization; needs kernel binder support and typically a privileged container; supports Android 8.1 to 16, arm64 and amd64; many instances per host. — [gist on Redroid](https://gist.github.com/aznoisib/d6f7ead962e030528f6cf05f480f1205); [LPI: Redroid](https://lpi.org/x6jx) (secondary; redroid-doc not fetched directly)
- redroid-doc repo: 6,987 stars, last push 2026-05-17, no GitHub releases. — [redroid-doc](https://github.com/remote-android/redroid-doc) (GitHub API)
- Waydroid: 12,401 stars, release 1.6.3 (2026-05-28), 968 open issues+PRs. — [Waydroid](https://github.com/waydroid/waydroid) (GitHub API)
- android-emulator-runner README: most cloud CI lacks nested virtualization, "the main obstacle" for emulators in containers. — [README](https://github.com/ReactiveCircus/android-emulator-runner)

### Inferences
- For a generic GitHub Action, self-hosted containers add little on GitHub-hosted runners (KVM is already there). They matter for (a) self-hosted runner fleets without KVM (Redroid), and (b) packing many base/head pairs per large host.
- Redroid is a poor default for screenshot comparison: it is not a stock emulator image (no Google APIs image parity, different rendering path), so screenshots and behaviour may diverge from emulator/device baselines. Unverified; needs a trial.
- Waydroid targets Linux desktop sessions (LXC + Wayland); from general knowledge it is not designed for headless CI. Not verified in this pass.

### Gaps
- No head-to-head CI benchmark (boot time, density, stability) of Redroid vs docker-android vs plain emulator found.
- Whether GitHub-hosted Ubuntu kernels ship the binder modules Redroid needs: no source.

## 5. Runtime signals: crashes, ANRs, logs, StrictMode, network, jank, leaks, accessibility, video; iOS equivalents; how existing tools present them

### Takeaway
Everything needed is reachable over adb without app changes: `logcat` (including a dedicated `crash` buffer), `dumpsys` (gfxinfo/framestats, meminfo, netstats), `screencap` and `screenrecord` (hard 180 s cap). Deeper signals (exit reasons with ANR traces and native tombstones, leaks, accessibility) need either an instrumentation helper or opt-in test libraries. Frame metrics on emulators are explicitly discouraged by Google as non-representative, so jank should be shown as a base vs head delta with a noise caveat, not an absolute.

### Cited Findings
**Logs and crashes (Android)**
- `logcat` buffers: `radio`, `events`, `main`, `system`, `crash`, `all`, `default`; `main` excludes system and crash messages; `default` = main + system + crash. Formats: `threadtime` (default) and modifiers incl. `epoch`, `uid`, `usec`, `UTC`. Filter specs `tag:priority` with `*:S` as allowlist. — [Android docs: logcat](https://developer.android.com/tools/logcat)
- The logcat doc page does not document `--pid`, `-T`, `-c`, `-e` or `-G`; it defers to `adb logcat --help` because options depend on OS version. — [Android docs: logcat](https://developer.android.com/tools/logcat)
- Native crashes: from Android 12 (API 31) an app can read its native crash tombstone as a protobuf via `ApplicationExitInfo.getTraceInputStream()` after `ActivityManager.getHistoricalProcessExitReasons(...)`; before that only adb could get it. — [Android NDK: debug](https://developer.android.com/ndk/guides/debug)
- DropBox: device dumps show `dumpsys dropbox -p <tag>` with tags such as `data_app_crash`, `data_app_anr`, `system_app_anr`, a 1,000-entry cap, and some entries marked "contents lost". Only weak sources (user-uploaded logs). — [Scribd dropbox dump](https://www.scribd.com/document/692474798/Drop-Box) (low quality)
- First-party pattern: the existing workflow dumps `adb logcat -d > logcat.txt` only when `connectedDebugAndroidTest` fails, and uploads it as an artifact. — [workflow](https://github.com/bwhtech/helpdesk_mobile/blob/develop/.github/workflows/build.yml)

**Performance and memory**
- `dumpsys gfxinfo <pkg>` gives UI frame data; `framestats` adds per-frame timing; `meminfo [-d] <pkg|pid>` (focus on Pss Total and Private Dirty, KB); `netstats detail` per-UID rx/tx bytes since boot; `procstats --hours N`; `batterystats --checkin`; `dumpsys -t` default timeout 10 s. — [Android docs: dumpsys](https://developer.android.com/tools/dumpsys)
- Benchmarks on emulators are "strongly discouraged" because results reflect host hardware; real devices or FTL recommended; Macrobenchmark writes one Perfetto trace per measured iteration. — [Android docs: benchmarking in CI](https://developer.android.com/topic/performance/benchmarking/benchmarking-in-ci)
- Macrobenchmark has `FrameTimingGfxInfoMetric`, a gfxinfo-based variant of `FrameTimingMetric`. — [androidx.benchmark.macro reference](https://developer.android.com/reference/kotlin/androidx/benchmark/macro/package-summary)
- Benchmark 1.5.0-alpha06 raised the Perfetto kill timeout from 5 to 30 s. — [Benchmark release notes](https://developer.android.com/jetpack/androidx/releases/benchmark)

**Leaks and accessibility**
- LeakCanary in UI tests: `androidTestImplementation leakcanary-android-instrumentation` plus `debugImplementation leakcanary-android`; `DetectLeaksAfterTestSuccess` rule or `LeakAssertions.assertNoLeaks()` throws `NoLeakAssertionFailedError`; custom `heapAnalysisReporter` can upload results; LeakCanary auto-disables when JUnit is on the classpath. — [LeakCanary UI tests](https://square.github.io/leakcanary/ui-tests/). Latest release v3.0-alpha-9 (2026-06-25). — [LeakCanary repo](https://github.com/square/leakcanary) (GitHub API)
- Espresso accessibility: `AccessibilityChecks.enable()`; `setRunChecksFromRootView(true)` checks the whole hierarchy on each ViewAction. — [Android docs: testing accessibility (Views)](https://developer.android.com/guide/topics/ui/accessibility/views/testing-views)
- Compose: `composeTestRule.enableAccessibilityChecks()` added in Compose 1.8.0, only on `AndroidComposeTestRule`, separate `ui-test-junit4-accessibility` artifact (third-party article, verify against AndroidX notes). — [ProAndroidDev](https://proandroiddev.com/automate-a11y-testing-in-compose-34b14306d167)
- Accessibility Test Framework repo last push 2024-04-03, no GitHub releases. — [ATF repo](https://github.com/google/Accessibility-Test-Framework-for-Android) (GitHub API)

**Screenshots and video**
- `screenrecord`: default and maximum 180 s (`--time-limit`), default bit rate 20 Mbps, no audio, rotation mid-recording cuts the frame, some devices cannot record native resolution. `screencap -p` via `adb exec-out` streams PNG to host. — [Android docs: adb](https://developer.android.com/tools/adb)

**iOS equivalents**
- Simulator crash reports go to `~/Library/Logs/DiagnosticReports` by default; CircleCI recommends uploading that directory as an artifact. — [CircleCI: iOS Simulator crash reports](https://support.circleci.com/hc/en-us/articles/360037683373-iOS-Simulator-Crash-Reports)
- Live logs: `xcrun simctl spawn booted log stream --level debug` with `--predicate` to filter by process (community skill doc, not Apple). — [skills.sh: iOS simulator debugger](https://www.skills.sh/willsigmon/sigstack/ios-simulator-debugger)
- `xcrun simctl diagnose` for full simulator diagnostics. — [Apple Developer Forums](https://developer.apple.com/forums/thread/90031)

**How existing tools present signals**
- Firebase Test Lab: outcome per matrix = passed / failed / **inconclusive** (infra error) / skipped (incompatible device); per-execution logs, screenshots, videos, per-test stack traces; Robo gets an activity map plus screenshots and videos annotated with the actions taken; Accessibility Scanner results for Robo; performance (startup, CPU, memory, network, FPS) only on physical devices; raw results kept 90 days in Cloud Storage. — [FTL: analyzing results](https://firebase.google.com/docs/test-lab/android/analyzing-results)
- Robo outputs: annotated screenshots, a video assembled from screenshots, crawl stats (actions, activities, screens), crawl graph (screens = nodes, actions = edges); supports test-account credentials, predefined text by resource-name regex, and up to 3 deep links crawled 30 s each. — [FTL Robo](https://firebase.google.com/docs/test-lab/android/robo-ux-test)
- emulator.wtf: test-result cache between runs (default on); multiple sharding algorithms. — [emulator.wtf sharding](https://docs.emulator.wtf/concepts/sharding); [emulator.wtf GitHub action](https://docs.emulator.wtf/integrations/github-action/)

### Inferences
- Capture defaults, Android: start `adb logcat -b all -v threadtime,epoch,uid` streaming to a file before app launch; keep a second stream of `-b crash`; filter per app by UID/PID at render time. Detect crashes and ANRs from `FATAL EXCEPTION`, `ANR in <pkg>` and tombstone lines plus `dumpsys dropbox` tags, and cross-check with exit reasons via a tiny instrumentation helper (API 30+), which also yields ANR traces and native tombstones (API 31+).
- Per screen: `dumpsys gfxinfo <pkg> reset` before navigation and read after, report janky-frame percentage as a base vs head delta only; `dumpsys meminfo` snapshot at end of flow.
- Video: chain `screenrecord` segments (180 s cap) or, cheaper, assemble a video from the per-step screenshots the agent already takes (the FTL Robo approach).
- Leaks and accessibility are opt-in signals that need the app's test deps; the tool should detect and surface them when present, not inject them.
- The PR comment should borrow FTL's "inconclusive" outcome for infra failures (emulator boot timeout, system dialogs) so flakes are not reported as app regressions.

### Gaps
- Official docs for `logcat --pid`, `dumpsys dropbox` usage, `ApplicationExitInfo` REASON constants and ANR trace availability were not retrieved (reference page too large to fetch); `dumpsys activity exit-info` not verified.
- StrictMode violation capture (logcat tag/format) and network error capture (OkHttp/HttpURLConnection logs, emulator proxy) not sourced in this pass.
- Apple primary docs for `log stream`, `simctl io`, and crash report format not fetched.

## 6. Security for PR runs: fork PRs, secrets (LLM keys), event split, cost caps

### Takeaway
Fork PRs get no secrets on `pull_request`, so the LLM key cannot be used there; the sanctioned pattern is an unprivileged `pull_request` build that uploads artifacts plus a privileged `workflow_run` job that holds secrets and posts the comment. Two recent platform changes harden this: since **2025-12-08** `pull_request_target` always runs the default branch's workflow, and since **June 2026 actions/checkout v7 refuses fork head checkouts under `pull_request_target`** (backported to supported majors on 2026-07-16).

### Cited Findings
- Split pattern: `pull_request` workflow builds with read-only token and no secrets, uploads results; `workflow_run` workflow with write permissions and secrets downloads the artifact and comments; treat artifacts as untrusted; "running binaries built from PR code in that context is a security vulnerability"; set `persist-credentials: false`; label gating ("safe to test") is racy because new commits can land after approval. — [GitHub Security Lab: preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
- `pull_request_target` change: effective 2025-12-08, the workflow file and checkout commit always come from the default branch. — [GitHub changelog 2025-11-07](https://github.blog/changelog/2025-11-07-actions-pull_request_target-and-environment-branch-protections-changes/)
- actions/checkout v7 GA (2026-06-18) fails on fork PR head/merge refs and fork repo/SHA under `pull_request_target`; does not cover `issue_comment` triggers or manual `git`/`gh` fetches; opt-out `allow-unsafe-pr-checkout: true`; enforcement backported to all supported majors on 2026-07-16, but SHA/minor/patch pins need upgrading. — [GitHub changelog 2026-06-18](https://github.blog/changelog/2026-06-18-safer-pull_request_target-defaults-for-github-actions-checkout); [The Hacker News](https://thehackernews.com/2026/06/github-updates-actionscheckout-to-block.html)
- Spend controls: Firebase budget alerts notify but do not cap. — [FTL pricing](https://firebase.google.com/docs/test-lab/usage-quotas-pricing). GitHub job limit is 6 h; per-job `timeout-minutes` is the available cap (the first-party workflow uses 30). — [GitHub docs: limits](https://docs.github.com/en/actions/reference/limits); [workflow](https://github.com/bwhtech/helpdesk_mobile/blob/develop/.github/workflows/build.yml)

### Inferences
- Recommended layout: job 1 (`pull_request`, no secrets) builds base and head APKs and the diff summary, uploads artifacts; job 2 (`workflow_run`, has LLM key) boots the emulator, installs the artifact APKs, drives them, posts the comment. Installing a fork-built APK in the privileged job contradicts Security Lab's strict rule; the emulator VM is a boundary for app code but the decision must be explicit and opt-in for forks (e.g. maintainer approval via a protected environment), and Gradle must never run in the privileged job.
- Prompt injection from on-screen text in a hostile PR is a cost and integrity risk, not a secret-exfiltration path, provided the agent's only tools are device actions and the key never reaches the emulator.
- Per-PR cost caps should be enforced in the tool itself: max agent steps per side, max tokens per PR, `timeout-minutes` on the job, `concurrency` groups with `cancel-in-progress` so pushes to the same PR cancel older runs.

### Gaps
- GitHub's fork-PR approval settings ("require approval for outside collaborators") and environment protection rules were not re-checked for 2026 changes.
- Anthropic/OpenAI workspace spend-limit mechanics not fetched.

## 7. Total cost per PR estimate (CI minutes + LLM tokens)

### Takeaway
For a typical Android app on a private repo, CI is cheap (about **$0.08 to $0.20 per PR** on Linux) and LLM tokens dominate: roughly **$0.05 (Haiku 5.5) to $0.70 (Sonnet 5.5) to $1.40 (Opus 5.5) per PR** for 40 agent steps per side with prompt caching and downscaled screenshots. Without caching the Sonnet figure rises to about $5. Public repos pay only the LLM part. iOS adds about $1 to $1.50 of macOS minutes.

### Cited Findings
- Claude prices (per million tokens, input / 5-min cache write / cache hit / output): Opus 5.5 $4 / $5 / $0.20 / $20; Sonnet 5.5 $2 / $2.50 / $0.10 / $10; Haiku 5.5 (prompts up to 100k) $0.10 / $0.125 / $0.01 / $0.50; Batch API 50% off. — [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Computer use toolset `computer_toolset_20260801` adds about 4,500 input tokens per request (tool definitions plus tool-use system prompt). — [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Image cost: `ceil(width/28) x ceil(height/28)` visual tokens; Claude 4.7+ high-res tier max long edge 2576 px / 4,784 tokens, others 1568 px / 1,568 tokens; computer-use `tool_result` images over the limit are rejected, not downscaled; a 1000x1000 image is 1,296 tokens. — [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- Published agent costs: AIMultiple (June 2026, single vendor) measured 4 Android agents on 65 emulator tasks: DroidRun 43% success at about $0.075 and ~3,225 tokens per task; Mobile-Agent 29% at ~$0.025; AutoDroid 14% at ~$0.017; AppAgent 7% at ~$0.90 (screenshot-heavy). — [AIMultiple: mobile AI agents](https://aimultiple.com/mobile-ai-agent). CovAgent (Claude Sonnet) reports ~$0.15 to $0.24 per target activity, $328 for 842 activities, mostly from repeated tool-call rounds. — [CovAgent, arXiv](https://arxiv.org/pdf/2601.21253). MobileCybench reports token cost per run but excludes emulator compute. — [MobileCybench, arXiv](https://arxiv.org/pdf/2609.23980)
- CI minute prices and first-party job timings: see sections 1 to 3. — [GitHub docs: runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing); [run 38678273450](https://github.com/bwhtech/helpdesk_mobile/actions/runs/38678273450)

### Inferences
Worked estimate (author's arithmetic from the cited prices; assumptions stated):
- **Screenshot size**: Pixel 6 native 1080x2400 = 39 x 86 = **3,354 tokens** on Opus/Sonnet 5.x (under the 2576 px cap, so not resized). Downscaled to 540x1200 = 20 x 43 = **860 tokens**.
- **Assumptions per side**: 40 steps; fixed prefix ~8k tokens (4.5k toolset + system + diff/screen plan); ~1.2k new input per step (860-token screenshot + ~300 tokens of UI tree text); ~150 output tokens per step; full history kept and cached.
  - Cached reads = 40 x 8k + 1.2k x 780 = ~1.26M tokens; cache writes ~62k; output ~6k.
  - Sonnet 5.5: $0.126 + $0.155 + $0.06 = **~$0.34 per side, ~$0.68 per PR**.
  - Opus 5.5: $0.25 + $0.31 + $0.12 = **~$0.68 per side, ~$1.36 per PR**.
  - Haiku 5.5: ~$0.023 per side, **~$0.05 per PR**.
  - Sonnet 5.5 with no prompt caching: ~1.32M x $2 = ~$2.64 per side, **~$5.3 per PR** (caching is worth ~8x).
  - Sonnet 5.5 with full-resolution screenshots (3,354 tokens): ~$0.79 per side, **~$1.6 per PR** (downscaling roughly halves cost).
  - Extended thinking would raise output tokens; not modelled.
- **CI minutes, Android, private repo**: measured single-side job ~6.5 min on a 4-vCPU public runner; base + head with one boot and two installs/drives estimated 12 to 15 min. At $0.006/min (2-core) = **$0.07 to $0.09**; at $0.012/min (4-core larger, closer to the public-runner hardware measured) = **$0.15 to $0.18**. Public repos: $0.
- **CI minutes, iOS, private repo**: 15 to 25 min at $0.062/min = **$0.93 to $1.55**.
- **Remote backends instead of local emulator** (20 device-minutes per PR): Genymotion SaaS $1.20; AWS Device Farm $3.40; FTL virtual $0.33 (batch only, no agent).
- **Typical total per PR**: Android private repo with Sonnet-class agent and caching ~$0.75 to $0.90; Opus-class ~$1.50; public repo ~$0.05 to $1.40 depending on model. Model tiering (cheap model for navigation steps, stronger model only for the final before/after judgement) should land near the low end.

### Gaps
- No published end-to-end "cost per PR" figure for an LLM-driven mobile PR tool was found; all totals above are derived.
- Step counts per affected screen and agent latency per step (which sets CI minutes) have no published baseline for this workload.

## 8. Recommended defaults and ideas worth porting

### Takeaway
Ship a Linux-x64-emulator-first action with pinned emulator and system image, cold boot (or a correctly keyed snapshot), streaming logcat from boot, per-step screenshots that double as the video, a `pull_request` + `workflow_run` split for secrets, and hard per-PR caps; keep device clouds as optional adapters behind one "device" interface.

### Cited Findings
- Robo-style artifacts (annotated screenshots, screenshot-assembled video, crawl graph, credential and text injection, deep-link entry points) and FTL's four-state outcome with "inconclusive" for infra errors. — [FTL Robo](https://firebase.google.com/docs/test-lab/android/robo-ux-test); [FTL: analyzing results](https://firebase.google.com/docs/test-lab/android/analyzing-results)
- GMD's "rerun only tests likely to produce different results" and emulator.wtf's test cache map onto diff-aware screen selection. — [Android docs: managed devices](https://developer.android.com/studio/test/managed-devices); [emulator.wtf GitHub action](https://docs.emulator.wtf/integrations/github-action/)
- Billing only for test runtime, not setup (FTL, emulator.wtf), is the norm for clouds and should be how the tool reports its own "device minutes". — [FTL pricing](https://firebase.google.com/docs/test-lab/usage-quotas-pricing); [emulator.wtf billing](https://docs.emulator.wtf/concepts/billing/)
- android-emulator-runner's `disable-animations`, `emulator-boot-timeout` (600 s), and `-no-snapshot-save` conventions. — [README](https://github.com/ReactiveCircus/android-emulator-runner)
- LeakCanary's pluggable `heapAnalysisReporter` and ATF's whole-hierarchy checks as opt-in signal sources. — [LeakCanary UI tests](https://square.github.io/leakcanary/ui-tests/); [Android docs: testing accessibility](https://developer.android.com/guide/topics/ui/accessibility/views/testing-views)

### Inferences
Recommended defaults (Android):
- Runner `ubuntu-latest` x64; KVM udev step; image `google_apis` x86_64 at API 34 or 35 (not ATD, not API 36 until boot-wait issues settle); pin emulator build rather than `channel: stable` latest; cache the system image, not the AVD, unless the cache key includes emulator and image versions.
- Readiness: `sys.boot_completed`, then `pm path android`, then dismiss system ANR dialogs; disable animations; boot timeout 300 s with one retry, failure reported as "inconclusive".
- Base and head: sequential in one job on private repos (one boot, `pm clear` and reinstall between sides), parallel jobs on public repos.
- Signals: logcat `-b all` stream from boot, `-b crash` stream, crash/ANR regex plus dropbox check, gfxinfo reset/read per screen as delta only, meminfo at end, screencap per step (also used to render video), optional screenrecord segments under 180 s.
- Caps: job `timeout-minutes` 20 (Android) / 40 (iOS); max 40 agent steps per side; token budget per PR; `concurrency` with `cancel-in-progress`; downscale screenshots to about 860 tokens; prompt caching on.
- iOS later: `macos-latest` arm64, one job for both sides because of the 5-job macOS cap, collect `DiagnosticReports` and `log stream` output.
- Optional backends behind an adapter: Genymotion SaaS (cheapest live per-minute), AWS Device Farm / BrowserStack / Sauce / TestMu (real devices via Appium), emulator.wtf and FTL/DDP only for batch instrumentation lanes.

### Gaps
- None of the defaults above have been benchmarked across apps; the timing basis is one app's CI (10 instrumented tests, API 35).

## 9. Item 12 experiments: building base and head in worktrees (2026-10-24)

Dogfood #95, base `3bc40b6` and head `3391968`, built by `twinrun run` in detached worktrees of a
scratch worktree of the dogfood repo; S1 AVD on the replay of `spikes/s1/dashboard.har`.

### Cited Findings
- `git worktree add` checks out the commit's tracked files; ignored and untracked files of the
  main checkout are not there. — [git-worktree](https://git-scm.com/docs/git-worktree)
- The dogfood debug build reads three files no commit holds: `local.properties` (`sdk.dir`, plus
  `release.*` signing values), `app/google-services.json` (gitignored; the release workflow
  writes it from a secret) and `app/src/debug/res/xml/network_security_config.xml` (S1's
  uncommitted D5 file). — dogfood `.gitignore`, `app/build.gradle.kts`,
  [`release.yml`](https://github.com/bwhtech/helpdesk_mobile/blob/develop/.github/workflows/release.yml)
- With no `local.properties` in the worktree and `ANDROID_HOME` set, `:app:assembleDebug`
  passed; AGP reads the SDK path from `ANDROID_HOME`. —
  [Android docs: environment variables](https://developer.android.com/tools/variables)
- The dogfood CI builds debug after `cp app/google-services.json.sample app/google-services.json`.
  — [`build.yml`](https://github.com/bwhtech/helpdesk_mobile/blob/develop/.github/workflows/build.yml)
  Built that way, the app crashed during sign in: `java.lang.IllegalArgumentException: Please set
  your Application ID` from `FirebaseInstallations.preConditionChecks`, called by Firebase
  Performance's `TransportManager`. twinrun reported `inconclusive: sign in ...: Element not
  found: Text matching regex: API Key`, exit 2 in 72 s; the crash was found in `logcat -b crash`.
- With the real `google-services.json` and the debug network security config as `--local-file`:
  `BUILD SUCCESSFUL` in 13 s (base) and 12 s (head), 43 tasks executed, warm Gradle user home;
  whole run exit 0 in 179 s. Leaderboard 18,507 pixels changed, one crop around the three
  highlighted avatars; `ticket_detail` and `ticket_detail_from_list` unchanged. Misses: 0 to the
  backend on either side; 56 (base) and 68 (head) to other hosts.
- After the run: no `twinrun-*` directory in the temp dir, only the main and scratch worktrees
  listed, `http_proxy` `:0`, no mitmdump process.

### Gaps
- Per side timings (install, sign in, each screen) are not broken out; the 150 s after the builds
  cover readiness and both sides.
- A cold Gradle user home, as in CI without a cache, was not measured.
