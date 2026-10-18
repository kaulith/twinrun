# S2: agent explores once over `maestro mcp`, replay runs without it

Maestro CLI 2.11.0 (Apache-2.0), JDK 21, the S1 device and replay proxy (`../s1/README.md`).

## Agent session

`bridge.py` holds one `maestro mcp` stdio session and serves it on `localhost:8765`, logging
every tool call with its reply and duration to a JSONL file. `mcp.sh inspect` and
`mcp.sh run '<yaml>'` are one agent step each; `tree.py` prints the text-bearing nodes of an
`inspect_screen` reply.

```sh
python3 -I bridge.py calls.jsonl ~/.maestro/maestro/bin/maestro &
./mcp.sh inspect | python3 tree.py
./mcp.sh run 'appId: <app id>
---
- tapOn: "Sign in"'
```

## Freeze and replay

```sh
python3 -I freeze.py calls.jsonl <app id> "Ticket ID" "SLA trend demo 6" > ticket_detail.yaml
maestro --device emulator-5554 test ticket_detail.yaml
```

- `ticket_detail.yaml`: the agent's run calls verbatim, its wrong erase and the 40 key
  correction included. Replayed 2 of 2, 66 s each.
- `ticket_detail_clean.yaml`: the same path with one `Dpad Down` before `eraseText`. 36 s.

Stop the bridge before `maestro test`; both drive the same on-device driver.
