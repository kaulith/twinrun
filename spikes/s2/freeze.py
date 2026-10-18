"""Freeze an agent's successful `maestro mcp` run calls into one replayable flow.

Usage: freeze.py <calls.jsonl> <appId> <landing text>... > flow.yaml

Commands are copied verbatim in call order, mistakes and corrections included; no
model edits the script. The flow ends in one assertVisible per landing text.
"""

import json
import sys

calls_path, app_id, *landing = sys.argv[1:]
commands = []
for line in open(calls_path):
    entry = json.loads(line)
    if entry["call"]["name"] != "run" or entry["reply"].get("result", {}).get("isError"):
        continue
    flow = entry["call"]["arguments"]["yaml"]
    commands.append(flow.split("\n---\n", 1)[1].rstrip())

print(f"appId: {app_id}\n---")
print("\n".join(commands))
for text in landing:
    print(f"- assertVisible: {json.dumps(text)}")
