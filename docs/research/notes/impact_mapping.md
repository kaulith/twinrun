# Selection layer: PR diff to affected screens, and navigating to them (research as of 2026-10-18)

Scope: the selection layer only. Given a PR diff, how does the tool decide which screens or flows to exercise, and how does it reach them? Native Android (Compose and Views) comes first, iOS second. The tool must stay generic. "Fetched" means this session read the primary page. "Search summary" means the claim came through a search result and was not opened, so treat it as weaker.

## 1. How do existing test impact analysis tools work, and which are open source?

### Takeaway
There are three families of tool:
1. **Static build or dependency graphs.** These are open source and deterministic, but coarse. Examples: Bazel tools, Nx, Turborepo, Gradle AffectedModuleDetector, Google TAP.
2. **Per-test coverage maps** from earlier runs. These are mostly commercial or closed. Examples: Microsoft TIA, Datadog TIA, Codecov ATS.
3. **ML or LLM prediction** from history or code similarity. These are commercial. Examples: Meta PTS, CloudBees Smart Tests (formerly Launchable).

Every serious tool shares the same safety features:
- a list of "global" paths that force a full run
- a fallback to "run everything" for unknown file types
- a manual override
- a periodic full run

### Cited Findings
**Google TAP (internal, not open source)**
- Google's continuous testing system keeps an in-memory graph of coarse-grained dependencies between tests and build rules, and updates it on every check-in. It uses this graph to find, transitively, every test that depends on the modified code. That dependency analysis is what limits how many tests run per change. — [Google Testing blog (search summary)](https://testing.googleblog.com/search/label/John%20Penix)
- The ICSE-SEIP 2017 paper (Memon et al.) says Google cannot regression-test each change on its own. It also finds that code recently changed by more than 3 developers breaks more often. — [Taming Google-Scale Continuous Testing](https://research.google/pubs/taming-google-scale-continuous-testing/)

**Bazel ecosystem (open source)**
- **bazel-diff** hashes the build graph at two git revisions and compares the hashes to find affected targets. One guide warns that a fingerprint detects change but does not prove what is affected. — [bazel-diff README (fork)](https://github.com/Asdprom/bazel-diff); [VirtusLab Bazel book 6.5.2](https://bazel.virtuslab.com/book/6~5~2/)
- **Target Determinator** (bazel-contrib) compares configured targets across revisions. — [conference slides](https://res.cloudinary.com/skillsmatter/image/upload/v1655904618/qvvlq4fjguggauyk91jn.pdf)
- **Aspect's `cache diff`** probes the remote cache: a hit means "unaffected", and each miss is attributed to its dependent tests. The `overreport` and `precise` modes trade false positives against cost. — [Aspect docs](https://aspect.build/docs/cli/tasks/cache_diff)
- `cquery` evaluates configured targets, so it costs more time and memory than `query`. — [VirtusLab Bazel book 5.2.7](https://bazel.virtuslab.com/book/5~2~7/)

**Nx (open source)**
- Git supplies the changed files. The project graph maps each file to its owning project, and Nx then adds the projects that depend on it.
- Defaults are `base` = main and `head` = the working tree.
- For CI, the docs recommend setting the base SHA to the last successful commit on main. — [Nx affected docs](https://nx.dev/docs/features/ci-features/affected)
- A project is also affected when one of its target inputs matches a touched file, such as a shared Jest config. Files in `.gitignore` or `.nxignore` are ignored. — [ITNext deep dive (secondary)](https://itnext.io/deep-dive-into-nx-affected-b3c29c715d41)

**Turborepo (open source)**
- `--affected` arrived in 2.1. It compares the current branch to the default branch over the package graph, and works like `--filter=...[main...HEAD]`.
- It works at package level: any changed file in a package selects all of that package's tasks.
- A shallow clone makes every package look changed.
- `TURBO_SCM_BASE` and `TURBO_SCM_HEAD` override the comparison. — [turbo run reference](https://turborepo.dev/docs/reference/run); [Turborepo 2.1 blog](https://turborepo.dev/blog/turbo-2-1-0)
- In GitLab detached-HEAD CI the base comparison fails, so all packages run. — [third-party blog](https://rebeccamdeprey.com/blog/using-the-turborepo---affected-flag-in-ci)

**Gradle AffectedModuleDetector (open source, Apache-2.0)**
- It maps git-changed files to Gradle modules, then has three modes:
  - changed modules
  - modules that depend on them
  - both (the default)
- The `compareFrom` options are `PreviousCommit` (the default), `ForkCommit`, `SpecifiedBranchCommit`, `SpecifiedBranchCommitMergeBase` and `SpecifiedRawCommitSha`.
- Configuration options:
  - `pathsAffectingAllModules`, `ignoredFiles` and `excludedModules`
  - `buildAllWhenNoProjectsChanged`, which defaults to true
- Tasks are `runAffectedUnitTests`, `runAffectedAndroidTests` and `assembleAffectedAndroidTests`.
- Mirrored repos can produce a wrong merge base.
- Dropbox has archived the repo; it is read-only and unmaintained. — [dropbox/AffectedModuleDetector](https://github.com/dropbox/AffectedModuleDetector)
- Flo Health maintains the fork, with a "Copyright 2026 Flo Health" notice and 4 open PRs. The page showed no release number or commit dates, so how active it is could not be confirmed. — [flo-health/AffectedModuleDetector](https://github.com/flo-health/AffectedModuleDetector)

**Microsoft Test Impact Analysis (Azure Pipelines, closed)**
- It builds dynamic per-test dependency maps over managed code (.cs and .vb files). It always also runs tests that failed before and tests that are new.
- A commit with a file type it cannot reason about, such as HTML or CSS, makes it run every test.
- Other features:
  - a recommended periodic "run all"
  - a `DisableTestImpactAnalysis` override
  - `TIA_IncludePathFilters`
  - a hand-written XML dependency map (`TIA.UserMapFile`), which "can even be approximate"
- Unsupported: .NET Core, UWP, multi-machine setups, data-driven tests.
- The doc's metadata says it was updated 2026-05-07. — [Microsoft Learn](https://learn.microsoft.com/en-us/azure/devops/pipelines/test/test-impact-analysis)

**Datadog Test Impact Analysis (formerly Intelligent Test Runner, commercial)**
- It cross-references per-test code coverage with the changed files, and looks at up to 100 recent commits.
- "Tracked files" such as Dockerfiles, Makefiles and manifests force a full run. Tests marked "unskippable" always run. `ITR:NoSkip` in a commit message or PR label runs everything.
- It cannot see changes to library dependencies, compiler options, external services, or data files.
- Limits: a commit touching more than 5,000 files is not analysed, and a test covering more than 16,000 files is never skipped.
- A Bloom filter has a false-positive rate of about 0.04%, which only ever runs extra tests.
- Listed languages are .NET, Java, JS, Swift, Python, Ruby and Go. Kotlin and Android are not named. — [Datadog docs](https://docs.datadoghq.com/tests/test_impact_analysis/)

**Codecov Automated Test Selection (beta, Python only)**
- It combines three inputs:
  - static analysis uploaded for BASE and HEAD
  - test "labels" collected at HEAD
  - the git diff
- Coverage must be uploaded with test-context labels. — [Codecov label analysis](https://docs.codecov.com/docs/label-analysis); [ATS overview](https://docs.codecov.com/docs/automated-test-selection)

**Meta Predictive Test Selection (paper; the system is internal)**
- It learns a selection strategy from historical test outcomes, using "basic machine learning techniques", and accounts for flaky tests.
- It still reports over 95% of individual test failures and over 99.9% of faulty changes, while roughly halving the infrastructure cost of testing.
- Machalica et al., arXiv 1810.05286, 2018, revised 2019. — [arXiv](https://arxiv.org/abs/1810.05286)

**CloudBees Smart Tests (formerly Launchable, commercial)**
- The current docs say it uses LLMs to compute similarity between changed files and test files, rank tests by likelihood of being affected, and order likely failures first. — [CloudBees docs (search summary)](https://docs.cloudbees.com/docs/cloudbees-smart-tests/latest/)
- The blog claims it needs no history and cites customer-reported CI runtime cuts of 35 to 70%. Those figures are vendor claims. — [CloudBees blog (search summary)](https://www.cloudbees.com/blog/how-cloudbees-smart-tests-works)
- Two sources contradict this:
  - The older Launchable help page describes training on past test runs. — [Launchable help](https://help.launchableinc.com/)
  - The onboarding guide recommends an observation mode that builds a "Confidence Curve" first. — [onboarding guide](https://docs.cloudbees.com/docs/cloudbees-smart-tests/latest/references/onboarding-guide)

**Jest (open source; cited from memory, the page was not fetched this session)**
- `--changedSince <branch>` runs tests related to changes since a branch or commit. `--findRelatedTests <files>` runs the tests that cover the given source files. Both resolve through Jest's module dependency graph. — [Jest CLI docs](https://jestjs.io/docs/cli)

### Inferences
- **Coverage maps transfer best to screens.** For each screen, record the classes or lines its baseline render executes, then intersect that set with the diff. This is the Datadog and Microsoft TIA idea with "test" replaced by "screen visit". It catches dynamic dispatch and dependency injection, which static graphs miss. It cannot see brand-new code, and it only covers the states the baseline visited.
- **Module graphs are free but coarse.** AffectedModuleDetector and Nx-style detection is the cheapest first filter. It does nothing for a single-module app, where every change affects "the app".
- **History-based ML has a cold-start problem.** Meta PTS and Launchable-era selection need run history. A new open-source tool has none at first, though history of "which screens actually showed a visual diff" could feed a ranker later.
- **The merge base is a known trap everywhere.** Nx, Turborepo, AffectedModuleDetector and TurboSnap all document it. The Action needs `fetch-depth: 0` (or an explicit merge-base fetch) and should diff against the merge base, not the tip of main.

### Gaps
- Buck/Buck2 target selection was not researched.
- The feature list and model type in the Meta paper are not in the abstract. The full PDF was not read.
- No independent accuracy figures were found for CloudBees Smart Tests.
- The Jest flags and the Gradle dependency-analysis plugin (`autonomousapps`) were not fetched this session. From memory, that plugin audits declared and unused dependencies and does not select tests; verify before relying on it.

## 2. How does Chromatic TurboSnap work, and how would it map to Android and iOS?

### Takeaway
TurboSnap works in three steps:
1. Take the git changes since the ancestor build(s).
2. Trace them through the Webpack or Vite dependency graph to story files.
3. Recapture only those stories and copy the rest.

A short list of "global" inputs forces a full rebuild. The mobile version replaces the bundler graph with a Gradle module graph plus a Kotlin class-reference graph, and replaces "story files" with screen roots: navigation destinations, Activities and Fragments, and screen-level `@Preview`s.

### Cited Findings
**How selection works**
- Chromatic finds the ancestor builds, unions the git changes since each ancestor's commit, and maps the changed files through the Webpack or Vite dependency graph to the affected story files.
- It captures only those stories, plus stories that were denied on the ancestor build. Everything else is copied from the baseline.

**What forces a full rebuild**
- a dependency version change in `package.json` with no valid lockfile
- a Storybook config change
- a change to any file imported by `preview.js`
- a change in the `--static-dir` folder
- a change to a file listed in `--externals`
- `--force-rebuild`

**Bypassed builds**
- If nothing in any story's graph changed, the whole build is bypassed. This needs CLI 17.7.0 or later, a single ancestor, and is never done for merge commits.
- Only the graph counts: a comment edit in an imported CSS file still triggers a capture.

**Known over-selection**
- A global decorator in `preview.js` that imports a barrel file makes many stories depend on unrelated files.
- Merge commits retest the union of both sides.
- After a rebase or squash, it searches for a "replacement build".

**Billing**
- Captured snapshot = 1, copied = 0.2, bypassed = 0. Example: 10 of 50 stories affected costs 18 snapshots instead of 50.

All of the above: [Chromatic TurboSnap docs](https://www.chromatic.com/docs/turbosnap/)

**Android preview discovery**
- **ComposablePreviewScanner** scans compiled bytecode with ClassGraph, not source.
  - It covers Android `@Preview`, Glance `@Preview` (since 0.7.0), and Compose Multiplatform (Android and desktop).
  - Filters: package trees, `includeIfAnnotatedWithAnyOf` / `excludeIfAnnotatedWithAnyOf`, and `filterPreviews {}`.
  - Multipreviews such as `@PreviewLightDark` and `@PreviewScreenSizes` are supported. Private previews need `includePrivatePreviews()`.
  - Paparazzi and Roborazzi run the scan on the JVM; Roborazzi has had built-in support since 1.22.0. Instrumentation tools (Shot, Dropshots, Android-Testify) need a JSON dump.
  - MIT licence. — [ComposablePreviewScanner](https://github.com/sergio-sastre/ComposablePreviewScanner)
- **Showkase** (Airbnb) uses kapt or KSP annotation processing over `@Preview` and `@ShowkaseComposable`, plus `@ShowkaseColor` and `@ShowkaseTypography`.
  - `Showkase.getMetadata()` returns a component list, a colour list and a typography list.
  - It generates dark, RTL, font-scaled and display-scaled variants. Custom multipreviews need KSP.
  - Version 1.0.5 in the README, Apache-2.0, 2.3k stars. — [airbnb/Showkase](https://github.com/airbnb/Showkase)
- **Sentry Snapshots for Android** (beta) turns every `@Preview` into an image with Paparazzi and ComposePreviewScanner, then diffs and posts a GitHub status. The docs describe no PR-diff-based selection: everything is uploaded. — [Sentry Android Snapshots docs](https://docs.sentry.io/platforms/android/snapshots/)
- The search summary also reports that Roborazzi's preview support was labelled "experimental", with class names subject to change. This comes via aggregators. — [sourcepulse summary](https://www.sourcepulse.org/projects/1853064)

**iOS preview discovery**
- **SnapshotPreviews** (Emerge Tools, also hosted under getsentry) finds SwiftUI and UIKit previews, both `PreviewProvider` and `#Preview`. It provides a gallery and no-code XCTest snapshot generation. The Emerge registry lists version 0.10.22, dated 2025-03-28. — [EmergeTools/SnapshotPreviews](https://swiftpackageregistry.com/EmergeTools/SnapshotPreviews); [getsentry/SnapshotPreviews](https://swiftpackageregistry.com/getsentry/SnapshotPreviews); [Emerge docs](https://docs.emergetools.com/docs/swiftui-previews)
- **DoorDash** maintains a separate `swiftui-preview-snapshots` library. — [doordash-oss](https://github.com/doordash-oss/swiftui-preview-snapshots)

**Module-level hashing on iOS**
- Tuist "selective testing" uses Tuist's hashing to run only tests affected since the last successful run. It works only for Tuist-generated Xcode projects; other build systems are "planned". — [Tuist docs](https://tuist.dev/en/docs/guides/features/selective-testing)

### Inferences
**How TurboSnap maps to Android**

| TurboSnap concept | Android equivalent |
|---|---|
| Bundler graph | Gradle module graph (coarse) plus a class-reference graph, read from compiled `.class` or `.dex` (ClassGraph is already proven by ComposablePreviewScanner) or from Kotlin PSI/UAST. |
| Story files | Screen roots: `composable<Route>` destinations, nav XML `<fragment>`/`<activity>` destinations, manifest Activities, and screen-level `@Preview`s. |
| `preview.js` and global triggers | Build scripts, `libs.versions.toml`, the theme and `MaterialTheme` wrapper, the `Application` class, DI module roots, `AndroidManifest.xml`, `themes.xml`, and the `values/` colours and dimensions. |
| Barrel-file over-selection | "God objects": a DI module, an app container, or a shared `UiState` base class. Traversal must stop at them, or cap fan-out. |

- **File-level granularity comes free for Compose.** Top-level Kotlin composables compile into `<File>Kt` classes, so a class-level reference graph is already file-level. That matches git diff granularity.
- **Previews give a cheap tier 0.** Render the affected `@Preview`s on the JVM with Roborazzi or Paparazzi, with no emulator and no navigation. This covers component-level changes deterministically. The device run is still needed for real navigation, data and screens that have no previews.
- **iOS needs a different graph.** There is no Gradle-like module graph unless the app uses Tuist or SPM modules. The fine-grained graph would come from the Xcode index store (see section 3).

### Gaps
- No public tool was found that does TurboSnap-style diff-to-`@Preview` selection on Android. Sentry, Showkase, ComposablePreviewScanner and Roborazzi all snapshot everything or filter by package or annotation. This is probably a real gap, but not exhaustively proven.
- Whether Sentry Snapshots skips unchanged previews on the server side is undocumented.

## 3. How can screens be mapped statically on Android and iOS?

### Takeaway
On Android, screens can be listed statically from:
- type-safe Compose Navigation (`composable<@Serializable Route>`)
- navigation XML graphs (`<fragment>`, `<deepLink>`)
- the manifest's Activities

The reverse-reference graph from a changed file up to those roots can be built from bytecode or from Kotlin analysis. On iOS the same graph can come from the compiler's index store (IndexStoreDB, as Periphery uses). Academic static extraction of GUI transition graphs (GATOR, StoryDroid) exists but over-approximates.

### Cited Findings
**Compose Navigation (type-safe)**
- Destinations are declared as `composable<Profile>(deepLinks = listOf(navDeepLink<Profile>(basePath = "$uri/profile")))` with a `@Serializable data class Profile(val id: String)`. The route object is read back with `backStackEntry.toRoute()`.
- Fragment destinations use the Kotlin DSL `fragment<ProfileFragment, Profile> { deepLink<Profile>(...) }`. — [Android deep link docs](https://developer.android.com/guide/navigation/design/deep-link)

**Navigation XML graphs**
- A `<deepLink app:uri=... app:action=... app:mimeType=...>` element sits on a destination.
- A `<nav-graph android:value="@navigation/nav_graph"/>` element in the manifest is replaced at build time by generated `<intent-filter>`s.
- Programmatic graphs built at runtime cannot generate intent filters, so they must be written by hand. — [Android deep link docs](https://developer.android.com/guide/navigation/design/deep-link)

**Academic static GUI models**
- GATOR's Window Transition Graph statically models window sequences, with their events, callbacks and the stack of active windows. — [Yang et al., Automated Software Engineering, doi 10.1007/s10515-018-0237-6](https://unpaywall.org/10.1007%2FS10515-018-0237-6)
- Static WTGs over-approximate and include infeasible transitions, while dynamic analysis misses some. ProMal combines static analysis, dynamic checking and ML. — [ProMal, ICSE 2021 SRC](https://2021.icse-conferences.org/details/icse-2021-ACM-Student-Research-Competition/11/ProMal-Precise-Window-Transition-Graphs-for-Android-via-Synergy-of-Program-Analysis-)
- StoryDroid extracts activity transition graphs statically and renders storyboards. — [arXiv 1902.00476](https://arxiv.org/pdf/1902.00476)
- StoryDistiller adds dynamic exploration. It reports about 23.3 transition pairs per app on average, against 7.78 for IC3 and 9.96 for Gator. Decompilation failures still cause misses. These figures come from a single preprint. — [arXiv 2203.06420](https://arxiv.org/pdf/2203.06420)
- Related work: static UI mining at scale ("What do all these Buttons do?") and scene-driven exploration and GUI modelling. — [arXiv 2105.03144](https://arxiv.org/pdf/2105.03144); [arXiv 2308.10228](https://arxiv.org/pdf/2308.10228)

**iOS index store**
- IndexStoreDB is a query API over the index data that Clang and Swift write with `-index-store-path`. It covers symbols, occurrences and relations, keyed by USR, and stores them in LMDB tables. — [swiftlang/indexstore-db](https://github.com/swiftlang/indexstore-db)
- Periphery finds unused Swift code by analysing the project's reference structure through the index store. It can skip the build with `--skip-build --index-store-path`. — [Periphery docs (search summary)](https://docsearch.algolia.com/mcp/docs/repo/peripheryapp/periphery)

### Inferences
**Screen registry (built once on the base branch and cached)**
Each entry records:
- an ID: the route class FQN, Fragment, or Activity
- the entry composable or class
- the deep link pattern, if one exists
- the argument types (from the `@Serializable` route)
- a navigation recipe

Sources, in order of reliability:
1. type-safe `composable<T>` / `navigation<T>` calls (parse source or the bytecode of the NavHost builder lambda)
2. nav XML
3. manifest Activities
4. older string-route constants (`"detail/{id}"`)

Navigation 3, where the app owns the back stack of keys, needs its own adapter (see gaps).

**Reverse-reference graph, per-edge rules and pitfalls**
- **Interface and implementation through DI.** The ViewModel references `TicketRepository`, while Hilt or Koin binds `TicketRepositoryImpl` in a module. A change to the impl then reaches only the DI module. Treat supertype edges (impl to interface) as reverse-traversable, or the static graph silently misses.
- **Inlining loses references.** `const val` values and `inline fun` bodies are inlined into bytecode, so the reference disappears. A source-level graph (PSI or UAST) or a text grep for the symbol name covers this.
- **Resources.** `strings.xml`, drawables and dimensions are referenced as `R.string.key` / `stringResource(R.string.key)` / `@string/key`. A grep on resource names in Kotlin and layout XML is simple and robust.
  - From memory, not verified this session: since AGP 8, app-module R fields are non-final (`android.nonFinalResIds`), so bytecode keeps the reference.
  - Translation-only changes (`values-xx/`) need a locale switch to become visible.
- **ViewModels** are usually reached in one hop from the screen composable (`hiltViewModel<T>()`, `koinViewModel<T>()`).
- **Repositories, DTOs and backend model classes** fan out to many ViewModels and screens. Cap the hops; Screenmap uses 1 to 3 hops and a cap of 8 screens.
- **Views stack.** Layout XML is referenced by Activities and Fragments (`R.layout.x`, view binding classes `XBinding`). A custom View is referenced by name in layout XML, which needs an XML parse.

**Tool options for the graph**
- ClassGraph over compiled classes: language-neutral and fast, but loses inlined constants and inline functions.
- Android Lint (UAST) or detekt with type resolution: source-level, but slower and needs type resolution.
- The K2 Analysis API: most precise, but heaviest and least stable.

A generic tool should probably use bytecode plus grep supplements first.

### Gaps
- Kotlin call-graph tooling was not fetched or verified: K2 Analysis API stability, detekt type resolution performance, Lint UAST reverse references, and ClassGraph's inter-class dependency API. No source was found that benchmarks any of them for diff-to-screen mapping.
- How Jetpack Navigation 3 handles deep links and declares destinations was not researched.
- No source was found on SwiftUI navigation extraction (`NavigationStack` with `navigationDestination(for:)`) or an iOS route registry; static enumeration of SwiftUI screens is an open problem here.
- IndexStoreDB's caller-query API, and whether it captures SwiftUI view composition edges, was not verified.

## 4. Does anyone use an LLM to decide "which screens does this diff touch" for mobile? Accuracy and failure modes?

### Takeaway
Screenmap (MIT, Aleksander Mikucki, August 2026) is the closest existing tool, and it does **not** use an LLM to pick affected screens. It traces imports statically, 1 to 3 hops from changed files to router routes, caps broad changes, and uses a Claude Code agent only afterwards:
- to write per-screen notes
- to mark a suspect "unaffected"
- to explore screens that have no recorded flow

No paper and no published accuracy figures were found for LLM diff-to-screen mapping. CloudBees uses LLM similarity for test selection, not screens.

### Cited Findings
**Screenmap: what it is**
- It is a GitHub Action plus a Claude Code plugin for Expo/React Native and NativeScript apps. It posts before and after images of affected screens on the PR. It "reports, does not gate". — [everydev listing](https://www.everydev.ai/tools/screenmap/llms.txt); [repo](https://github.com/aleqsio/screenmap)

**Screenmap: how it selects screens**
- Suspects are "the screens a pull request's diff can reach, worked out from the router and the changed files".
- `suspects.depth` sets the import hops followed out from a changed file: 1, 2 or 3 depending on the `effort` preset. `suspects.broadCap` (default 8) caps the screens marked by a change to a widely imported file.
- A PR run executes `parse-routes` on head, then `diff-map suspects` against the baseline graph.
- Route discovery parses expo-router file conventions or react-navigation route maps. Edges come from a regex, so dynamic hrefs resolve to their pattern. Screens registered without URLs are invisible to the static parse. — [repo](https://github.com/aleqsio/screenmap); [everydev listing](https://www.everydev.ai/tools/screenmap/llms.txt)

**Screenmap: platforms and cost**
- The listing says "iOS only", which contradicts the repo README: Android runs on `ubuntu-latest` and iOS on macOS. The README is newer and primary.
- A JavaScript-only PR takes about 12 minutes; a full baseline about 20.
- About 105 stars at indexing, last pushed 2026-08-28. — [everydev listing](https://www.everydev.ai/tools/screenmap/llms.txt); [repo](https://github.com/aleqsio/screenmap)

**Other related work**
- A USPTO filing, "Bidirectional visual indexing system and method for codebase impact analysis", parses a PR diff into changed functions and classes, then links them to the screens and workflows that call them. This is a search summary only; it does not say an LLM is the mechanism. — [USPTO PDF](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12675388)
- LLM work on mobile GUI testing deals with live exploration, not diff impact:
  - LLM-guided escape from UI tarpits — [arXiv 2604.06763](https://arxiv.org/abs/2604.06763)
  - scenario-guided GUI testing agents — [arXiv 2506.05079](https://arxiv.org/html/2506.05079)
  - LDMDroid, which uses an LLM to summarise before and after UI changes to find data-manipulation errors — [arXiv 2604.00458](https://arxiv.org/pdf/2604.00458)
- CloudBees Smart Tests uses LLM similarity between changed files and tests. This is test-level, with vendor-reported savings only. — [CloudBees docs (search summary)](https://docs.cloudbees.com/docs/cloudbees-smart-tests/latest/)

### Inferences
**Expected failure modes for a static-plus-LLM mapper**

| Failure | What goes wrong | Mitigation |
|---|---|---|
| Shared components (button, row, card) | Fan out to most screens, so either over-selection or a cap that silently drops screens | Render the component's `@Preview`s plus N representative screens, and name the skipped ones in the comment |
| Theme, typography, colour tokens, `CompositionLocal` providers | Global change; the static graph says "everything" | Smoke set, one screen per top-level destination, plus previews |
| ViewModel or state logic changes | The visual effect depends on data or state; the screen may look identical on fixture data | The LLM must pick or describe the backend state that exercises the change, not just the screen |
| Repository, DTO or backend model changes | Long fan-out, and the change shows only with specific payloads | Same as above; this is where LLM judgement adds most |
| Strings and translations | Easy to map by key; locale variants need a locale switch | Grep by resource key |
| DI-bound implementations, reflection, serialization, navigation by string route, feature flags or remote config | Static edges disappear | Supertype edges, string grep, and treating flag files as global |
| New screens or routes in the PR | No baseline, so head-only capture | Detect from the registry diff |
| Pure non-UI changes (analytics, logging, workers) | False positives | The LLM may demote these with a written reason |

**The LLM's role should be to adjudicate, not to discover.** Hallucinated screen names are possible, so constrain its output to IDs that exist in the registry. Require an evidence chain (changed symbol, then a path, then the screen) for every addition. Never let it remove a static hit without logging the removal in the PR comment. Screenmap's split matches this: static suspects, with the agent allowed to demote.

### Gaps
- No precision or recall numbers exist, in Screenmap or anywhere else, for diff-to-screen mapping, static or LLM.
- No Android-native equivalent of Screenmap was found.
- The details of Screenmap's agent "unaffected" decisions (prompt, evidence) were not read.

## 5. How should the tool navigate to a target screen?

### Takeaway
Ranked by speed and determinism:
1. a deep link, or a debug-only test entry point that takes a route plus arguments
2. a recorded flow (Maestro YAML, tagged per screen) with an end-screen check
3. an agent that navigates from home and records its path as a flow for reuse
4. paths from a cached crawl graph (DroidBot UTG or a Robo crawl), which are mostly diagnostic

Screenmap already ships 2, then 1, then 3 as a fallback chain, with drift detection.

### Cited Findings
**Deep links on Android**
- Explicit deep links (a `PendingIntent` built with `NavDeepLinkBuilder` or `TaskStackBuilder`) clear the task back stack and rebuild it with the start destination of each nested graph.
- For implicit deep links, the result depends on `FLAG_ACTIVITY_NEW_TASK`.
- With `singleTop`, the app must call `navController.handleDeepLink(intent)` in `onNewIntent`.
- Screens behind login should use conditional navigation.
- Path placeholders `{id}` match one or more characters. Extra query parameters do not affect matching. — [Android deep link docs](https://developer.android.com/guide/navigation/design/deep-link)
- That page does not document the usual `adb shell am start -W -a android.intent.action.VIEW -d <uri> <pkg>` test command (noted as not on the page).

**Screenmap's navigation chain**
1. Committed argent flows (Software Mansion) in `.screenmap/flows/` replay with no LLM. The end screen is OCR'd (Apple Vision on Mac, tesseract on Linux, which "recovers noticeably fewer words") and checked against landmarks in a `.meta.json` sidecar.
2. On a mismatch the flow is marked "drifted", the screen is captured by deep link, and the flow is queued for re-recording.
3. Deep links use `xcrun simctl openurl`.
4. Only screens with no flow reach the agent, which records new tap paths as flows.
5. Route params come from config. Without them, `/brew/[id]` opens as `/brew/1` and may capture a not-found screen.
6. Agent budgets are 6, 8 or 24 screens by preset. The PR comment lists what was skipped. — [repo](https://github.com/aleqsio/screenmap)

**Maestro tags**
- Flows carry `tags:` in their YAML header. `--include-tags` and `--exclude-tags` match any listed tag (OR); include is applied first, then exclude. There is no AND within one flag.
- `config.yaml` can set default `includeTags` and `excludeTags`. — [Maestro docs](https://docs.maestro.dev/cli/tags); [BrowserStack Maestro tags](https://www.browserstack.com/docs/app-automate/maestro/set-up-test-env/configure-tests/add-maestro-tags)

**Crawl graphs**
- DroidBot builds a UI transition graph (UTG) after testing. It needs no instrumentation or system modification, using the Accessibility service. It supports `-humanoid` and `-script`. MIT licence. — [honeynet/droidbot](https://github.com/honeynet/droidbot)
- Firebase Robo records a crawl graph (screens as nodes, actions as edges) with stats, annotated screenshots and video.
- Robo scripts in strict mode stop on failure and resume a regular crawl.
- No export or reuse of the crawl graph is documented. — [Firebase Robo test](https://firebase.google.com/docs/test-lab/android/robo-ux-test); [Robo scripts](https://firebase.google.cn/docs/test-lab/android/run-robo-scripts?hl=en)

**Agent navigation reliability (all aggregator sources, which conflict)**
- AndroidWorld has 116 tasks across 20 apps.
  - One aggregator lists 97.4% pass@1 at the top, sampled 2026-06-01, mostly from single trials. — [benchmarklist](https://benchmarklist.com/benchmarks/androidworld/)
  - Another tracks fewer models and shows 81.0% at the top on 2026-07-29. — [BenchLM](https://benchlm.ai/benchmarks/androidworld)
  - Commentary from April 2026 calls the benchmark saturated. — [agentmarketcap](https://agentmarketcap.ai/blog/2026/04/06/androidworld-91-mobile-agents-benchmark-saturation-enterprise-consumer)
- On the harder successor, MobileWorld, the best agent scores 51.7% and the best end-to-end GUI model 20.9%. — [benchmarklist MobileWorld](https://benchmarklist.com/benchmarks/mobileworld/)

### Inferences
**Tradeoffs**

| Method | Speed | Determinism | Cost to the app |
|---|---|---|---|
| Deep link | ~1 to 2 s, deterministic | Best | Only works for routes the app exposes; needs real argument values from the fixture backend; auth must already be done |
| Debug test entry point | As fast as a deep link | Best | Needs a small opt-in debug dependency (see below) |
| Recorded flow | Seconds to tens of seconds | Deterministic until the UI drifts | Breaks on exactly the PRs that change navigation, so it needs drift detection |
| Agent | Tens of seconds to minutes, plus model cost | Non-deterministic between base and head | Can take different paths on each side, which undermines a visual comparison of base and head |

- **A debug test entry point is the most reliable generic option for Compose.** A debug-only Activity takes `--es route <FQN> --es args <json>`, decodes the `@Serializable` route class, and calls `navController.navigate(route)`. This needs a small opt-in debug dependency in the app.
- **Record on base, replay on head.** The agent should navigate base first, record its path, and replay the same path on head. That preserves comparability.
- **Crawl graphs suit seeding, not runtime use.** A cached crawl graph (DroidBot or Robo) is useful for seeding the registry and finding paths to screens with no deep link. It is fragile with dynamic state, so a fresh rebuild on main (Screenmap's baseline-on-push-to-main pattern) beats a cache that lives forever.

### Gaps
- No primary data was found comparing navigation success or time for deep links, recorded flows and agents on the same apps.
- Whether a Robo crawl graph can be exported in machine-readable form is not documented.
- The AndroidWorld figures are aggregator-only and inconsistent.
- No source was found on iOS XCUITest launch arguments or test entry points for SwiftUI `NavigationStack` (only `simctl openurl` via Screenmap).

## 6. What should the fallback policy be when the mapping is uncertain, and what is the recommended pipeline?

### Takeaway
Every mature tool fails toward running more, while capping cost:
- TurboSnap rebuilds everything on global files.
- Microsoft TIA runs everything on unknown file types.
- Datadog uses tracked files plus a no-skip override.
- AffectedModuleDetector has `buildAllWhenNoProjectsChanged`.

For an advisory device tool, "run everything" is too expensive on emulators. The recommended ladder is: static hits, then capped and ranked; a smoke set on global changes; an LLM to adjudicate the rest; skip on zero impact; a full run on demand by label; and a periodic full baseline on main. The PR comment always lists what was skipped.

### Cited Findings
**Full-run triggers in existing tools**
- TurboSnap's triggers: config, `preview.js` imports, lockfile, static dir, externals. It bypasses the build when nothing in the graph changed. — [Chromatic](https://www.chromatic.com/docs/turbosnap/)
- Microsoft TIA runs all tests for file types it cannot understand. It recommends a periodic run-all, has `DisableTestImpactAnalysis`, and suggests validating by running both the selected tests and all tests. — [Microsoft Learn](https://learn.microsoft.com/en-us/azure/devops/pipelines/test/test-impact-analysis)
- Datadog: tracked files force all tests; tests can be marked unskippable; `ITR:NoSkip` works as a commit message or PR label; the default branch is never skipped; some changes are acknowledged as undetectable. — [Datadog](https://docs.datadoghq.com/tests/test_impact_analysis/)
- AffectedModuleDetector: `pathsAffectingAllModules`, `ignoredFiles`, and `buildAllWhenNoProjectsChanged`, which defaults to true. — [dropbox/AffectedModuleDetector](https://github.com/dropbox/AffectedModuleDetector)
- Turborepo: a shallow clone makes all packages count as changed. — [turbo run reference](https://turborepo.dev/docs/reference/run)

**Budget handling in Screenmap**
- It has a broad-change cap (`broadCap` 8), an agent screen budget (6, 8 or 24), and "the comment says what got skipped". Its baseline refreshes on every push to main and on a weekday cron, and `auto_baseline` builds one if it is missing. — [Screenmap repo](https://github.com/aleqsio/screenmap)

### Inferences
**Recommended pipeline (static first, LLM fallback)**
1. **Diff.** Diff against the merge base (needs `fetch-depth: 0`). Classify each file as:
   - ignored: docs, tests, CI, `*.md`
   - global: build scripts, version catalog, theme, Application class, manifest, DI roots, `values/` themes or colours, user-configurable `pathsAffectingAllScreens`
   - resource: by key
   - code
2. **Skip on zero impact.** If every changed file is ignored, post "no screens affected" and stop, as TurboSnap bypass does.
3. **Static candidates.** Run module-graph filtering, then a reverse-reference traversal, up to the screen registry roots. Use bytecode plus grep, treat supertype edges as reverse-traversable, cap depth at about 2 to 3 hops, and cap fan-out. Each candidate keeps its evidence path.
4. **Optional coverage tier.** If the baseline run on main collected per-screen coverage (JaCoCo on a debug build), intersect the changed lines with each screen's coverage. Prefer this signal for existing code, and use the static graph for new code.
5. **LLM adjudication.** The inputs are the diff, the candidates with evidence, the registry, and the global-trigger flags. The output must be:
   - registry IDs only
   - a rank
   - a reason for each add or demote
   - a backend-state hint
   - a confidence
   The LLM handles what static analysis cannot: which screens matter for DTO, backend or state changes; non-visual changes; and which state shows the change.
6. **Global or uncertain cases.** Run a smoke set: launch, then one screen per top-level destination, plus the screens named by the LLM, within the budget. Do not run everything by default.
7. **Budget and transparency.** Run N screens at most, by rank. The PR comment lists the selected screens with their evidence, the skipped screens with the reason, and the triggers that fired.
8. **Overrides and safety net.** A PR label (for example `device-test: all`) runs the full registry. A scheduled or on-push-to-main full run refreshes the baseline map and registry, as Screenmap does and Microsoft TIA recommends.

**Known failure modes of this design, and their mitigations**
- **Over-selection from god objects or shared UI** gets capped, so some affected screens are silently skipped. Mitigation: list the skips, and add previews of the changed component.
- **Under-selection** from DI, reflection, inlining, string routes, flags, or server-driven UI. Mitigation: supertype edges, grep, flag files treated as global, and the coverage tier.
- **Right screen, wrong state:** the change is invisible on fixture data. Mitigation: an LLM state hint plus scenario fixtures. This is the hardest problem, and it couples to the deterministic-backend layer.
- **Navigation drift** on PRs that change navigation. Mitigation: end-screen landmark checks and a deep-link fallback.
- **Base and head paths that differ** under agent navigation. Mitigation: record on base, replay on head.
- **Merge-base or shallow-clone errors** that make everything look changed. Mitigation: always do a full fetch.
- **Wrong advisory output costs little.** A wrong selection only costs reviewer attention, which is why Screenmap and this design report rather than gate.

### Gaps
- No empirical study was found measuring false-negative rates of capped screen selection, or of smoke-set fallbacks, for mobile apps.
- No numbers were found on per-screen coverage overhead on Android emulators (JaCoCo on-device) for building a coverage map.
- The right budget size (N screens) and the cost per screen on GitHub-hosted Linux emulator runners are not covered in this file.
