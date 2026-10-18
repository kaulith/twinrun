# S3: diff to screens through the class graph

ClassGraph 4.8.196 (MIT, `LICENSE-ClassGraph.txt` in the repo and in the jar; 4.8.197 to 6.0.0
were all under two weeks old on the day), the dogfood app built at each PR's merge commit.

## Inputs

- `registry.json`: written by hand from `NavGraph.kt` and `BottomNavGraph.kt` at 629bb9c. Nine
  screens with route, deep link, composable and one D15 identity selector; one container
  (`MainScreen`, which hosts the bottom NavHost); the two nav graph functions. No selector has
  run on a device; `{text: Ranking, selected: true}` assumes the bottom bar item exposes
  selected state.
- `hand.json`: each PR's screen set, written from its diff before the graph ran.

## Run

```sh
B=https://repo1.maven.org/maven2/io/github/classgraph/classgraph/4.8.196
mkdir -p lib && curl -so lib/classgraph-4.8.196.jar $B/classgraph-4.8.196.jar
echo "$(curl -s $B/classgraph-4.8.196.jar.sha1)  lib/classgraph-4.8.196.jar" | shasum -a 1 -c
git -C <app> worktree add --detach <wt> <commit>   # copy local.properties and google-services.json in
(cd <wt> && ./gradlew -q :app:compileDebugKotlin)
java -cp lib/classgraph-4.8.196.jar Dump.java \
  <wt>/app/build/intermediates/built_in_kotlinc/debug/compileDebugKotlin/classes dump.tsv
python3 -I walk.py dump.tsv <wt> <commit> registry.json hand.json --dispatch
```

`Dump.java` writes every class with its source file, declared methods, supertypes and
dependencies. `walk.py` maps the commit's changed files to their classes, walks reverse
references over source files for 2 hops (reports 3), and scores the reached screens against
`hand.json`. Output per PR in `results/`.

## Results

| PR | Hand set | Graph set, `--dispatch` | Hits | Misses | Extras |
| --- | --- | --- | --- | --- | --- |
| #95 ranking avatar | leaderboard | leaderboard (hop 0) | 1 | 0 | 0 |
| #99 menus | tickets, ticket_detail, leaderboard, reports, report_builder | same five (hop 0) | 5 | 0 | 0 |
| #92 notifications | none | login, settings (hop 2) | 0 | 0 | 2 |
| #100 agent chip, probe | five tabs, ticket_detail | those six, reports, report_builder (hop 0 and 1) | 6 | 0 | 2 |

Without `--dispatch`, #92 reaches nothing; the rest are unchanged. Without the container
entry, #100 reaches ticket_detail only: 5 misses. #100 is outside the plan, walked on the
#99 build (its parent), to test chrome above a NavHost.

## Findings

- **Nodes are source files.** Kotlin turns one file into `XKt`, `ComposableSingletons$XKt` and
  lambda classes. Koin's inlined `singleOf` lambdas carry the library's `SourceFile`
  (`SingleOf.kt`), so grouping by `SourceFile` alone made fake nodes; a `$` class now counts
  as its outer class's file.
- **Constant pool references carry Compose calls.** `LeaderboardScreenKt -> FilterSheetKt` is an
  edge. #99 is weak evidence on its own, since every screen `FilterSheet` reaches also
  changed directly; `FilterSheet.kt` walked alone reaches tickets and leaderboard at hop 1.
- **DI hides the implementation.** From `FrappeAuthRepository.kt` the plain walk reaches only
  `RepositoryModule.kt`, then `HelpdeskAnalyticsApp.kt` and `ProfileModules.kt`; its empty
  set matched the hand set by accident. Stepping to supertypes reaches `AuthRepository.kt`,
  then `LoginViewModel` and `SettingsViewModel`. The changed code is private `signIn`, called
  from `validateCredentials` and `completeOAuthLogin`, so login is where it runs; settings
  calls `switchSite` and `logout`, which never reach it. A class graph cannot tell them apart;
  a method-level call graph could.
- **Chrome above a NavHost has no reverse edge to the screens under it.**
  `AgentChip.kt <- MainScreen.kt <- NavGraph.kt` ends at `MainActivity`. A container entry
  (a destination whose composable hosts a nested NavHost) maps a reached `MainScreen.kt` to
  its eight screens. Its two extras are reports and report_builder, where the top bar is
  hidden (`showBottomBar` is the tab routes only).
- **Nav graph files are sinks.** Without that, every screen change climbs
  `BottomNavGraph.kt <- MainScreen.kt` and the container expands to all eight screens. With
  sinks, #95 reaches 2 files instead of 4.
- **A no-screen PR is a backend change.** #92 alters no pixel; the login flow on head sends one
  more request, which the D13 addon reports as a backend miss. The graph's login pick is the
  flow worth driving, for the miss rather than a crop.
- The app uses string routes (`composable("reports")`), not type-safe routes.
- AGP's built-in Kotlin writes classes to
  `app/build/intermediates/built_in_kotlinc/debug/compileDebugKotlin/classes`, not
  `tmp/kotlin-classes/debug`; the analyzer takes the path from the build.
- Dump: 786 classes, 2882 dependency edges, 0.46 s including JVM start and source launch.
