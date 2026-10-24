# S1: fail-closed HAR replay

## Setup (Mac, arm64)

- AVD `twinrun_s1_api35`: `system-images;android-35;google_apis;arm64-v8a`, `pixel_6`.
- mitmproxy 12.2.3 via `uv tool install mitmproxy`; CA in `~/.mitmproxy`, Android name
  `openssl x509 -subject_hash_old -noout -in ~/.mitmproxy/mitmproxy-ca-cert.pem` + `.0`.
- App debug build with a `debug-overrides` network security config trusting `user` certs.

## Device

```sh
emulator -avd twinrun_s1_api35 -no-snapshot -no-boot-anim -no-audio -no-window
openssl x509 -in ~/.mitmproxy/mitmproxy-ca-cert.pem -outform DER -out c8750f0d.0
adb root && adb push c8750f0d.0 /data/local/tmp/
adb shell 'mkdir -p /data/misc/user/0/cacerts-added &&
  mv /data/local/tmp/c8750f0d.0 /data/misc/user/0/cacerts-added/ &&
  chown -R system:system /data/misc/user/0/cacerts-added &&
  chmod 644 /data/misc/user/0/cacerts-added/c8750f0d.0 &&
  restorecon -R /data/misc/user/0/cacerts-added'
adb shell settings put global http_proxy 10.0.2.2:8080
adb install -r -g app-debug.apk
```

## Record (backend served locally over http, app still sees https)

```sh
mitmdump --listen-host 127.0.0.1 -p 8080 --set connection_strategy=lazy \
  -s remap.py --set remap_host=dev.localhost --set remap_upstream=http://127.0.0.1:8000 \
  --set hardump=session.har
```

Stop with SIGINT; the HAR is written on exit. Scrub `authorization` headers before keeping it.

## Replay (no upstream route; every miss is a 404 and a line in misses.jsonl)

```sh
mitmdump --listen-host 127.0.0.1 -p 8080 --set connection_strategy=lazy \
  --server-replay session.har --set server_replay_reuse=true \
  -s failclosed.py --set miss_log=misses.jsonl
```

Sign in with any API key and secret; replay does not match on headers.

## Capture (items 10 and 11)

`app/` is laid out as an app repo: `.github/twinrun.yml` plus a sign-in flow, a ticket flow and a
leaderboard flow. With `twinrun mock` serving `dashboard.har` and the side's APK installed, from
`app/`:

```sh
MAESTRO_API_KEY=replay-key MAESTRO_API_SECRET=replay-secret \
  twinrun capture --serial emulator-5554 --screen leaderboard --out <dir>
twinrun compare --base <base dir>/leaderboard.png --head <head dir>/leaderboard.png --out crop.png
```
