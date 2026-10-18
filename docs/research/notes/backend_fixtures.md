# Deterministic backend state for mobile PR device testing (record/replay, mocks, seeding)

Scope: how a generic GitHub Action gives an Android emulator (later iOS simulator) realistic, repeatable backend responses for base and head runs, for any backend, with as few app changes as possible. Research date 2026-10-18. Facts below were checked against the cited page this session unless marked otherwise; anything I could not confirm is in Gaps.

## 1. Tool landscape: record/replay and mock servers compared

### Takeaway
Two tools cover the generic, out-of-process case well: mitmproxy (capture plus `server_replay` with explicit matching knobs and fail-closed unmatched handling) and WireMock (record to stubs, JSON body matching that ignores order and extra elements, scenarios for repeated requests, forward-proxy mode with its own CA). In-app VCR libraries (OkReplay) and hosted or eBPF tools (Speedscale, Keploy) do not fit a generic, no-code-change mobile action.

### Cited Findings

**WireMock**
- Recording: `POST /__admin/recordings/start` with `targetBaseUrl`, stop with `/__admin/recordings/stop`; stubs are created only when recording stops. Snapshotting (`/__admin/recordings/snapshot`) turns already received requests into stubs; to capture an external API you first add a `proxyAllTo` mapping at priority 1 — [WireMock record-playback](https://wiremock.org/docs/record-playback/)
- Default generated matching: JSON bodies use `equalToJson` with `ignoreArrayOrder` and `ignoreExtraElements` true; XML uses `equalToXml`; others `equalTo`. Headers are only matched if listed in `captureHeaders` — [WireMock record-playback](https://wiremock.org/docs/record-playback/)
- `repeatsAsScenarios` (default true): identical requests that got different responses become a Scenario replayed in order, the last response repeating after the series; `extractBodyCriteria` (`textSizeThreshold`, `binarySizeThreshold`) moves large bodies to files; `filters` select what is recorded; custom `transformers` (`StubMappingTransformer`) can rewrite stubs at record time — [WireMock record-playback](https://wiremock.org/docs/record-playback/)
- Forward proxy for devices: `--enable-browser-proxying`; HTTPS is intercepted automatically, certs signed by a root CA in `$HOME/.wiremock/ca-keystore.jks` (or `--ca-keystore`), root CA downloadable at `/__admin/certs/wiremock-ca.crt`. Unmatched requests pass through when `proxyPassThrough` is true (default); it can be set false. Docs recommend "using WireMock over HTTP to proxy HTTPS" and state the feature relies on internal Sun classes and works on OpenJDK 1.8 through 14 (possibly stale text) — [WireMock proxying](https://wiremock.org/docs/proxying/)
- Proxy stubs (`proxyBaseUrl`), low priority catch-all proxy with higher priority overriding stubs, `removeProxyRequestHeaders`, `additionalProxyRequestHeaders`; a `proxied-hostname-rewrite` transformer exists "since 4.0.0-beta.20", so WireMock 4 is in beta — [WireMock proxying](https://wiremock.org/docs/proxying/)

**mitmproxy**
- Modes: regular (HTTP proxy, port 8080), local capture (by process, Windows/Linux/macOS; Linux needs kernel 6.8+), WireGuard (userspace VPN, can capture "individual Android apps"), reverse (HTTP, HTTPS, DNS, TCP, TLS, UDP, DTLS, QUIC, HTTP/3), transparent (Linux/macOS), TUN (Linux, root or `CAP_NET_ADMIN`), upstream, SOCKS5, DNS. Docs warn some apps bypass OS proxy settings, "Android apps" being a common example; use WireGuard, local or transparent mode for those — [mitmproxy modes](https://docs.mitmproxy.org/stable/concepts/modes/)
- Server replay options: `server_replay` (flow files), `server_replay_extra` (default `forward`; choices forward, kill, 204, 400, 404, 500 for unmatched requests), `server_replay_ignore_content`, `server_replay_ignore_host`, `server_replay_ignore_port`, `server_replay_ignore_params` (list), `server_replay_ignore_payload_params` (form/multipart), `server_replay_use_headers` (list of headers that must match; default none), `server_replay_reuse` (default false: a flow is consumed once served), `server_replay_refresh` (default true: rewrites date, expiry, last-modified and cookie expiry headers), `save_stream_file` for recording; `server_replay_nopop` and `server_replay_kill_extra` are deprecated aliases — [mitmproxy options](https://docs.mitmproxy.org/stable/concepts/options/)
- Community report that `server_replay_ignore_params` given on the CLI did not take effect until set in the Options view, and that repeated `--set` kept only the last value (user report, not confirmed bug) — [mitmproxy discourse](https://discourse.mitmproxy.org/t/server-replay-ignore-params-usage/1093)

**Mockoon**
- MIT license; CLI `npm install -g @mockoon/cli`, `mockoon-cli start --data ./data-file.json`; Docker `mockoon/cli:latest`; GitHub Action `mockoon/cli-action@v3`; "The CLI supports all of Mockoon's features" incl. templating, response rules, proxy mode, OpenAPI compatibility; releases page links 9.9.0 — [Mockoon CLI](https://mockoon.com/cli/)
- Recording is started with the Record button in the GUI logs view and "will only create a route once, based on the path and HTTP method"; works best with proxy mode on — [Mockoon auto-mocking and recording](https://mockoon.com/docs/latest/logging-and-recording/auto-mocking-and-recording/)

**Prism (Stoplight)**
- Apache-2.0; mocks from OpenAPI 3.1, 3.0, 2.0 and Postman Collections; `prism proxy` validates live traffic against the spec ("check for discrepencies between your API implementation and the OpenAPI document"); json-schema-faker is a dependency; "Data Persistence" is only a roadmap item, so mocks are stateless — [stoplightio/prism](https://github.com/stoplightio/prism)

**Hoverfly**
- Apache 2.0, copyright 2025 Hoverfly Cloud, "developed and maintained by iOCO Solutions", ~2.5k stars, no archive notice — [SpectoLabs/hoverfly](https://github.com/SpectoLabs/hoverfly)
- Six modes, one active at a time: Capture, Simulate, Spy, Synthesize, Modify, Diff — [Hoverfly modes](https://docs.hoverfly.io/en/latest/pages/keyconcepts/modes/modes.html)

**Keploy**
- Apache-2.0; "uses eBPF to capture traffic at the network layer", no SDK or code changes; records API calls, DB queries (Postgres, MySQL, MongoDB) and queues (Kafka, RabbitMQ); `keploy record -c "CMD"` / `keploy test -c "CMD" --delay 10`; turns captured flows into tests and mocks; mentions time freezing for deterministic replay; no mention of mobile apps — [keploy/keploy](https://github.com/keploy/keploy)

**OkReplay (Airbnb)**
- Apache-2.0, v1.5.0, ~785 stars, no archive notice; an OkHttp `Interceptor` that serves from YAML "tapes" when a `MatchRule` matches; `TapeMode.READ_WRITE` / `READ_ONLY`; Gradle plugin tasks `pullDebugOkReplayTapes` and `clearDebugOkReplayTapes`; Espresso via `OkReplayRuleChain` and `@OkReplay`; `debugImplementation` okreplay, `releaseImplementation` noop — [airbnb/okreplay](https://github.com/airbnb/okreplay)
- Based on Betamax, itself inspired by Ruby VCR; works only for apps using OkHttpClient (mirror of README, secondary) — [codekk mirror](https://p.codekk.com/detail/Android/airbnb/okreplay)

**Polly.js (Netflix)**
- Last commit and last npm release 2023-07-20 (6.0.6); no archive notice found — [ossinsight](https://ossinsight.io/analyze/Netflix/pollyjs); [@pollyjs/utils changelog](https://classic.yarnpkg.com/en/package/@pollyjs/utils)

**Speedscale proxymock**
- Free local CLI: record (inbound and outbound as RRPair files), mock (serves outbound), replay, inspect TUI; recording remote systems and CI/CD integration require Speedscale Enterprise; unmatched requests fall through to the real system by default; setup needs an API key or registered email (docs disagree) — [proxymock CLI docs](https://docs.speedscale.com/proxymock/how-it-works/cli/); [proxymock FAQ](https://docs.speedscale.com/proxymock/getting-started/faq/); [proxymock page](https://speedscale.com/proxymock/)

**Microcks**
- Accepted as CNCF incubating project (post dated 2026-05-07); mocks from OpenAPI, AsyncAPI, gRPC/Protobuf, GraphQL, Postman, SOAP/WSDL; same contracts drive conformance tests against real services; Async Minion covers Kafka, MQTT, AMQP, WebSocket, Google Pub/Sub; stable 1.14.0 at time of post; integrates with GitHub Actions — [CNCF blog](https://www.cncf.io/blog/2026/05/07/microcks-becomes-a-cncf-incubating-project/)
- Apache-2.0 and a 1.15.0-rc1 (2026-06-22) per a third-party page only (unverified) — [dev.co](https://dev.co/testing/open-source/microcks)

Summary table (only verified cells filled; "?" = not verified this session):

| Tool | License | Runs as | Record mode | Matching control | State for repeats/writes | CI fit for generic mobile |
|---|---|---|---|---|---|---|
| mitmproxy | ? (see Gaps) | forward / WireGuard / reverse / transparent proxy | `save_stream_file` | ignore params, payload params, content, host, port; opt-in headers | ordered pop of flows unless `server_replay_reuse` | High; `server_replay_extra=404/kill` fails closed |
| WireMock | ? | standalone server, forward proxy with CA | record or snapshot to JSON stubs | equalToJson ignore order/extra; headers opt-in; filters, transformers | `repeatsAsScenarios` | High; Java runtime; HTTPS forward proxy doc caveat |
| Mockoon CLI | MIT | server, Docker, GH Action | GUI only, one route per path+method | rules | ? | Medium; good for hand-authored mocks |
| Prism | Apache-2.0 | server from OpenAPI | none (validation proxy) | spec-driven | stateless | Fallback when only a spec exists |
| Hoverfly | Apache 2.0 | proxy | Capture mode | ? | ? | Plausible; details unverified |
| Keploy | Apache-2.0 | eBPF on the backend host | record | ? | time freezing | Backend side only |
| OkReplay | Apache-2.0 | in-app OkHttp interceptor | READ_WRITE tapes | MatchRules | ? | Low; needs app code, OkHttp only |
| Speedscale proxymock | proprietary, free local | local CLI | record | ? | ? | Low; CI needs Enterprise |
| Microcks | Apache-2.0 (3rd party) | server | none (contract import) | contract-driven | ? | Spec-first teams; multi-protocol |
| Polly.js | ? | JS library | yes | ? | ? | None for native; idle since 2023 |

### Inferences
- mitmproxy's flow-pop default plus `server_replay_reuse=false` naturally replays "list, POST, list again" in recorded order; WireMock's `repeatsAsScenarios` gives the same per identical request. Both break if the app reorders or parallelizes requests differently on head than at record time.
- mitmproxy's Python addon model is the most direct place to put scrubbing, normalization and miss reporting; WireMock gives a richer stub format humans can edit. A tool can record with mitmproxy and replay with either.
- Mockoon recording (GUI, one route per path+method) collapses pagination and query variants, so it is unsuitable as the automated recorder; it fits only hand-authored fixtures.
- Prism and Microcks produce schema-valid but not realistic data; they answer "empty screen" only partially, so they are a fallback, not the default.
- Keploy captures traffic of Linux processes; it is relevant only if the tool runs the real backend in CI (mocking that backend's own DB/queues), not for capturing the app.
- Speedscale's CI restriction rules it out for an open source action.

### Gaps
- Not verified this session (prior knowledge only, confirm before publishing): mitmproxy license (believed MIT); WireMock license (believed Apache 2.0) and current stable version; Pact license and status; OkHttp MockWebServer (`mockwebserver3`) status; Betamax archive status; Charles and Proxyman licensing; Hoverfly capture `--stateful`, templating and state details; Mockoon data buckets / CRUD routes; WireMock response templating helpers and near-miss reporting.
- Latest release dates for WireMock, mitmproxy, Hoverfly, Keploy, Prism could not be read (GitHub release sections came back empty).
- Keploy OS requirements (Linux kernel, macOS via Docker) not stated on the README.
- gRPC and websocket replay specifics for mitmproxy and WireMock not researched.

## 2. Getting app traffic into the mock without app changes (Android, then iOS)

### Takeaway
Least invasive path for generic Android apps: set the Android system proxy (`adb shell settings put global http_proxy`) to the host mock and make the device trust the mock's CA. CA trust is the real obstacle: apps targeting API 24+ ignore user CAs, so either the app ships a debug-only `network_security_config` (one XML file, also bypasses pinning for that CA) or the tool injects the CA into the system store on a rooted emulator image, which on Android 14+ needs a per-boot APEX bind-mount. The emulator's own `-http-proxy` flag does not decrypt HTTPS and is not the right tool.

### Cited Findings
- Android has two mutually exclusive proxies: the Android System Proxy (app layer, HTTP/HTTPS, inspection works "with a certificate installed") and the Emulator Proxy (`emulator -http-proxy http://host:port` or `http_proxy` env var; routes all TCP; "tunnels HTTPS traffic over TCP, but this traffic is forwarded without decryption, which prevents HTTPS inspection"; no no-proxy list; no UDP). "Some apps may ignore the system's proxy settings." The doc suggests configuring the system proxy via Settings or UI Automator — [Android emulator proxy](https://developer.android.com/studio/run/emulator-networking-proxy)
- System proxy via adb: `adb shell settings put global http_proxy "<ip>:<port>"`, disable with `adb shell settings put global http_proxy :0` (third-party guides) — [Genymotion](https://rozz.genymotion.com/pages/how-to-connect-a-virtual-device-to-a-proxy.html); [Proxyman adb guide](https://proxyman.com/posts/2020-10-20-How-To-Use-Android-Debug-Bridge-(adb)-To-Install-And-Trust-Self-Signed-Certificate-To-Android-Emulators); [Requestly](https://interceptor-docs.requestly.com/interceptor/desktop-app/android-simulator-interception)
- CA trust defaults: apps targeting API 23 and lower trust system and user CAs; API 24 to 27 trust system only; API 28+ base config is `cleartextTrafficPermitted="false"` with system trust anchors only — [Android network security config](https://developer.android.com/privacy-and-security/security-config)
- `<debug-overrides>` applies only when `android:debuggable` is true and "is completely ignored" otherwise; example trusts `@raw/debug_cas`. "Trust anchors specified in debug-overrides are added to all other configurations, and certificate pinning is not performed when the server's certificate chain uses one of these debug-only trust anchors"; `overridePins` defaults true inside debug-overrides — [Android network security config](https://developer.android.com/privacy-and-security/security-config)
- The same page now has version notes for Android 15 (CT not available), Android 16 (CT opt-in) and Android 17 (CT and ECH enabled by default, plus an implicit localhost configuration) — [Android network security config](https://developer.android.com/privacy-and-security/security-config)
- Android 14 moved system CAs to the APEX path `/apex/com.android.conscrypt/cacerts`; "all of /apex is immutable"; writing `/system/etc/security/cacerts` no longer changes trust. Workaround needs root: tmpfs over `/system/etc/security/cacerts` with old certs plus the new one, then `nsenter` into `zygote`/`zygote64` mount namespaces and bind-mount it over the APEX path, and repeat for running apps; lasts until reboot; "works out of the box on all the rooted official Android 14 emulators" (Sept 2023) — [HTTP Toolkit](https://httptoolkit.com/blog/android-14-install-system-ca-certificate/)
- mitmproxy WireGuard mode can capture individual Android apps and is the documented answer for apps that ignore proxy settings — [mitmproxy modes](https://docs.mitmproxy.org/stable/concepts/modes/)
- WireMock forward proxy serves its root CA at `/__admin/certs/wiremock-ca.crt` for installation on the client — [WireMock proxying](https://wiremock.org/docs/proxying/)
- iOS simulator: `xcrun simctl keychain booted add-root-cert <path>` (Xcode 12.5+, per Proxyman); syntax `simctl keychain <UDID> <add-root-cert|add-cert|reset>`; one report of `NSOSStatusErrorDomain code=-50` depending on certificate format — [Proxyman](https://proxyman.com/posts/2021-04-17-Install-Certificate-For-iOS-Simulator-On-Xcode-12.5); [Appium forum](https://discuss.appium.io/t/help-solve-the-problem-with-mobile-installcertificate-on-ios/37216). No Apple primary doc found.

### Inferences
Ranked by invasiveness for a generic action:
1. **System proxy + debug NSC (recommended default, one small app change).** Tool sets `http_proxy` to `10.0.2.2:<port>` (the emulator's alias for the host; standard, not verified this session), pushes the mock's CA as a user CA, and the repo carries a debug-only `debug-overrides` trusting user CAs or a bundled raw CA. Works on non-rooted Google Play images, survives pinning via `overridePins`, cannot leak into release builds.
2. **System proxy + system CA injection on a rooted Google APIs image (zero app change).** Tool does `-writable-system` remount for API ≤33 or the APEX tmpfs/nsenter dance for API 34+, every boot. Fully generic but fragile across Android versions; Android 17 default CT is an open risk (see Gaps).
3. **VPN capture (mitmproxy WireGuard mode)** for apps that ignore the system proxy (likely Flutter/Dart `HttpClient`, not verified); needs a WireGuard client on the emulator, still needs CA trust.
4. **Base URL injection via build variant / instrumentation arg + `adb reverse`** pointing at a plain HTTP mock: cleanest TLS story but an app change per app, and API 28+ blocks cleartext unless NSC allows it or the Android 17 localhost rule covers it.
5. **In-app interceptor (OkReplay, MockWebServer):** most invasive and OkHttp-only; useful only as an opt-in adapter.
- Pinned production builds should never be the tested artifact; the action should build the debuggable variant so `debug-overrides` applies.
- On iOS the simulator shares the Mac's network stack, so a host proxy plus `simctl keychain add-root-cert` is the analogous path; ATS and in-app pinning (e.g. TrustKit) remain per-app concerns.

### Gaps
- Whether `<certificates src="user"/>` inside `debug-overrides` is supported is not stated on the Android page (it shows only `@raw/...`); widely used in practice but unverified here.
- Whether Android 17's default Certificate Transparency enforcement rejects MITM CAs (user or injected system) was not documented on the page; needs testing on an API 37 image.
- Whether a MITM proxy behind `-http-proxy` can still terminate TLS when the guest trusts its CA (Android docs say HTTPS is not decrypted) was not resolved.
- How iOS simulator proxying is configured headlessly in CI (host `networksetup` vs per-process env) was not researched; no Apple primary source found for `simctl keychain`.
- Emulator DNS override (`-dns-server`, hosts file) as an alternative was not verified.

## 3. Matching and determinism (dynamic fields, time, auth, images, push)

### Takeaway
Determinism comes from loose request matching (ignore auth headers, volatile query and body params, array order) combined with fail-closed handling of misses and a frozen notion of "now". Both WireMock and mitmproxy expose the needed knobs; time-relative UI ("3 hours ago"), expiring tokens, images and push need explicit handling by the tool.

### Cited Findings
- WireMock does not match headers unless listed in `captureHeaders`, and matches JSON bodies ignoring array order and extra elements by default — [WireMock record-playback](https://wiremock.org/docs/record-playback/)
- mitmproxy matching knobs: `server_replay_ignore_params`, `server_replay_ignore_payload_params`, `server_replay_ignore_content`, `server_replay_ignore_host/port`, opt-in `server_replay_use_headers`; `server_replay_refresh` (default true) rewrites date, expiry, last-modified and cookie expiry headers on replay; `server_replay_extra` chooses forward, kill or a fixed status for unmatched requests — [mitmproxy options](https://docs.mitmproxy.org/stable/concepts/options/)
- A user relied on `server_replay_kill_extra` so requests not in the replay never hit the real internet — [mitmproxy discourse](https://discourse.mitmproxy.org/t/block-or-fail-all-requests-not-in-the-replay/1475)
- WireMock `extractBodyCriteria` with `binarySizeThreshold` stores large binary bodies (images) as separate files — [WireMock record-playback](https://wiremock.org/docs/record-playback/)
- Keploy advertises time freezing for deterministic replay (server-side) — [keploy/keploy](https://github.com/keploy/keploy)
- Speedscale proxymock forwards unmatched requests to the real system by default, the opposite of fail-closed — [proxymock FAQ](https://docs.speedscale.com/proxymock/getting-started/faq/)

### Inferences
- Default matcher profile for the action: method + host + path + query minus a denylist of volatile params (`_`, `t`, `ts`, `nonce`, `cacheBuster`), JSON body with volatile keys stripped, no headers except an opt-in list (e.g. `Accept`, GraphQL `operationName` via body). Make it overridable per repo in config.
- Fail closed (`server_replay_extra=404` or WireMock `proxyPassThrough=false`) and log every miss; head-only misses are themselves a useful PR signal ("head calls `GET /api/x`, no recording").
- Time: response bodies carry absolute timestamps from record time. Either freeze the device clock to the recording's timestamp (requires root on emulator; method unverified) or rewrite body timestamps relative to replay time at record/serve time via an addon. `server_replay_refresh` only touches headers.
- Auth: replay the recorded login/token exchange so the app reaches a signed-in state; JWT `exp` claims expire, so rewrite or freeze. Browser-based OAuth (Custom Tabs) goes through the same system proxy, but a better path is skipping UI login by seeding the app's token (app-specific) or recording the token endpoint only.
- Ordering: parallel requests at startup can reach the mock in different orders; WireMock scenarios and mitmproxy pop order are per identical request, so only identical-request sequences are order-sensitive.
- Images/CDN: either record images (heavy, stored as files) or serve one placeholder per content type so screenshots differ only in layout; placeholders keep fixtures small but hide image-related regressions.
- Push (FCM) does not travel over the app's HTTP proxy path; simulate notifications via an adb broadcast or test hook rather than through the mock.

### Gaps
- How to set the emulator clock deterministically in CI (`adb shell date` with root, `settings put global auto_time 0`) was not verified.
- WireMock response templating for relative dates (e.g. `now` with offset) not verified this session.
- No primary source found on handling FCM in emulator CI; gRPC/websocket determinism not covered.

## 4. Write requests: stateful mocks vs a real ephemeral backend

### Takeaway
Recorded sequences (scenario or pop order) handle "POST then list shows it" when the head build issues the same requests in the same order; anything new needs a stateful mock or a real backend. A real backend seeded per run (docker-compose/Testcontainers) is the most faithful but is only possible when the backend is containerizable and the team supplies seed scripts, so it should be an opt-in mode, not the default.

### Cited Findings
- WireMock `repeatsAsScenarios` turns identical requests with different recorded responses into an ordered Scenario — [WireMock record-playback](https://wiremock.org/docs/record-playback/)
- mitmproxy consumes each recorded flow once unless `server_replay_reuse` is set, giving ordered replay of repeated requests — [mitmproxy options](https://docs.mitmproxy.org/stable/concepts/options/)
- Prism has no data persistence (roadmap only), so it cannot reflect writes — [stoplightio/prism](https://github.com/stoplightio/prism)
- Meticulous (web, network-stubbed PR replays) notes mutation-then-GET flows work within a single recorded session but are harder across sessions — [Meticulous network recording](https://app.meticulous.ai/docs/concepts/network-recording-and-patching)
- Keploy can mock a backend's DBs and queues, letting a real backend run in CI without its infra — [keploy/keploy](https://github.com/keploy/keploy)

### Inferences
- Tradeoffs:
  - Recorded sequences: zero infra, deterministic, any backend; brittle when the diff changes request order or adds writes; no new data can appear.
  - Hand-authored stateful mock (Mockoon/WireMock with state): handles new writes, but authoring cost per endpoint and drift from the real API.
  - Real ephemeral backend: true behaviour, writes and reads stay consistent; costs boot time, CI minutes, seed maintenance, and introduces nondeterministic IDs and timestamps that must be normalized before screenshot diffing; impossible for closed or SaaS backends.
- Recommended: default to recorded sequences with fail-closed misses; offer `backend: compose` (user provides compose file + seed command) as an opt-in mode; the proxy still sits in front to log and normalize.

### Gaps
- Testcontainers and docker-compose boot times for typical backends on GitHub-hosted runners not researched.
- Mockoon data buckets / CRUD route statefulness not verified.

## 5. Keeping recordings fresh and in sync with the API

### Takeaway
Treat fixtures as code: re-record on a schedule against staging with a test account, scrub at record time, validate stored responses against the API schema on every PR, and surface fixture age and schema drift in the PR comment. No surveyed tool does all of this end to end.

### Cited Findings
- Prism `proxy` mode checks live traffic against an OpenAPI document and flags discrepancies — [stoplightio/prism](https://github.com/stoplightio/prism)
- Microcks runs conformance tests from OpenAPI, AsyncAPI, gRPC, GraphQL contracts against real implementations, with GitHub Actions integration — [CNCF blog](https://www.cncf.io/blog/2026/05/07/microcks-becomes-a-cncf-incubating-project/)
- WireMock record-time `transformers` can rewrite stubs as they are generated (hook for scrubbing) — [WireMock record-playback](https://wiremock.org/docs/record-playback/)
- WireMock proxy can strip request headers (`removeProxyRequestHeaders`) — [WireMock proxying](https://wiremock.org/docs/proxying/)
- Grab's iOS team describes a local proxy recording API traffic during a session, feeding generated mocks, feature flag state and analytics expectations into Xcode UI tests (search snippet only; page returned 404 on fetch, unverified) — [Grab engineering](https://engineering.grab.com/ios)

### Inferences
- Refresh loop: scheduled workflow (weekly + manual dispatch) runs the same flows against staging in record mode, runs a scrubber addon, and opens a PR with the fixture diff; humans review it like code.
- Drift detection without hitting staging: validate every stored response against the OpenAPI (or GraphQL schema) operation it maps to on each PR; flag fixtures that fail or operations with no fixture. When a spec is absent, the re-record diff is the only drift signal.
- Scrubbing: drop `Authorization`, `Cookie`, `Set-Cookie`, API keys; replace emails, names, phone numbers and tokens in bodies with stable fakes (same input, same fake, so cross-references survive); run a secret scanner over fixtures as a CI gate.
- Store metadata per fixture set (recorded_at, backend version, account) and print fixture age in the PR comment.
- Base and head should replay the same fixture set (head's), so screenshot diffs isolate app changes; a PR that also edits fixtures gets that called out separately.

### Gaps
- No primary source found for a mobile team's documented re-record cadence or PII scrubbing pipeline.
- Pact (consumer contracts) as a drift guard not verified this session.

## 6. Prior art: mobile teams doing this in CI

### Takeaway
Public prior art is thin and dated: Airbnb's OkReplay (in-app VCR for Espresso), Allegro's WireMock-backed iOS UI tests (2016), library approaches like The Stubborn Network, and newer proxy-capture flows (Grab, Maestro plus Proxyman). I found no current Uber, Spotify or Shopify posts on this specific topic.

### Cited Findings
- Airbnb OkReplay: record on first run, replay from YAML tapes committed to the repo so CI can use them; Espresso/JUnit; OkHttp only — [airbnb/okreplay](https://github.com/airbnb/okreplay)
- Allegro (2016): UI tests tied to live server data break when data changes or servers are down; they use WireMock as a stub server started before the test run, which can also record stubs — [Allegro tech blog](https://blog.allegro.tech/2016/10/self-contained-UI-tests-for-ios-applications.html)
- The Stubborn Network (Swift): a `URLProtocol` injected into `URLSession` records and plays back stubs per test — [q231950/the-stubborn-network](https://github.com/q231950/the-stubborn-network)
- Mobile Automator MCP pairs Maestro with Proxyman capture, correlates UI actions and requests by timestamp, outputs Maestro YAML plus WireMock stubs, with selective mocking that sends unmocked routes to the real server — [glama listing](https://glama.ai/mcp/servers/jegriffi91/mobile-automator-mcp) (aggregator listing, unverified)
- Grab iOS: local recording proxy feeds generated mocks into Xcode UI tests (snippet only, unverified) — [Grab engineering](https://engineering.grab.com/ios)
- Meticulous (web) records sessions and stubs network on each PR, the closest analogue to the planned action on web — [Meticulous](https://app.meticulous.ai/docs/concepts/network-recording-and-patching)

### Inferences
- The industry pattern converges on: record once through a proxy or interceptor, commit fixtures, replay fail-closed in CI. The out-of-process proxy variant is the one that generalizes across frameworks and platforms.

### Gaps
- Airbnb's original OkReplay announcement post, and any Uber, Spotify, Shopify, Lyft engineering posts on mobile network fixtures, were not found in this session.

## 7. Recommended backend design for the action

### Takeaway
Default: a host-side proxy (mitmproxy, MIT per prior knowledge) in front of the emulator, CA trust via a debug-only NSC (or root injection when the repo opts out of any change), replaying committed, scrubbed fixtures fail-closed, with the same fixture set for base and head. Opt-in modes: OpenAPI mock (Prism) when no recordings exist, and a real seeded backend (compose) for write-heavy flows.

### Cited Findings
- Foundations used: system proxy and CA trust rules — [Android emulator proxy](https://developer.android.com/studio/run/emulator-networking-proxy), [Android network security config](https://developer.android.com/privacy-and-security/security-config), [HTTP Toolkit Android 14](https://httptoolkit.com/blog/android-14-install-system-ca-certificate/); replay knobs — [mitmproxy options](https://docs.mitmproxy.org/stable/concepts/options/); stub format and scenarios — [WireMock record-playback](https://wiremock.org/docs/record-playback/); spec fallback — [stoplightio/prism](https://github.com/stoplightio/prism)

### Inferences
Proposed pipeline (all inference, built on the findings above):
1. **Config** (`.github/twinrun.yml`): `fixtures: path`, `hosts: [api.example.com, cdn...]`, `match: {ignore_params, ignore_body_keys, use_headers}`, `misses: fail|forward`, `trust: nsc|root`, `backend: replay|openapi|compose`.
2. **Boot:** start mitmproxy (regular mode) on the runner with `server_replay=<fixtures>`, `server_replay_extra=404`, `server_replay_reuse` per config, ignore lists from config, plus an addon that logs misses and rewrites time fields. Boot emulator; `adb shell settings put global http_proxy 10.0.2.2:8080`.
3. **Trust:** if `trust: nsc`, push CA as user cert (debug NSC trusts it, pins bypassed); if `trust: root`, use a Google APIs image and inject into the system store (APEX bind-mount on API 34+).
4. **Run base and head** against the same fixtures; reset proxy state between runs so pop order restarts.
5. **Report:** per screen screenshot diff plus a "backend" section: head-only misses, base-only misses, fixture age, schema-validation failures.
6. **Refresh job:** `workflow_dispatch` + weekly cron in record mode against staging using repo secrets; scrubber addon; opens a fixture PR.
7. **iOS later:** same proxy; `xcrun simctl keychain booted add-root-cert`; host-level proxy config.
- WireMock is the alternate engine when teams want hand-editable JSON stubs and scenarios; the fixture format should be engine-neutral (HAR-like) to avoid lock-in.
- Out of scope for the mock: push notifications, OAuth browser flows, non-HTTP protocols; document them as limitations.

### Gaps
- Not prototyped: end-to-end timing on GitHub-hosted runners, behaviour with Flutter/React Native apps, and Android 17 CT impact. These need a spike before committing to the design.
