#!/bin/sh
# One agent step against emulator-5554: mcp.sh inspect, or mcp.sh run '<yaml>'
case "$1" in
  inspect) body=$(python3 -c 'import json; print(json.dumps({"name":"inspect_screen","arguments":{"device_id":"emulator-5554"}}))') ;;
  run) body=$(python3 -c 'import json,sys; print(json.dumps({"name":"run","arguments":{"device_id":"emulator-5554","yaml":sys.argv[1]}}))' "$2") ;;
esac
curl -s -X POST localhost:8765/call -d "$body" | python3 -c '
import json,sys
r=json.load(sys.stdin)
res=r.get("result") or r
for c in res.get("content",[]):
    if c.get("type")=="text": print(c["text"])
if res.get("isError"): print("isError: true")
'
