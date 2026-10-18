"""Fail closed: every request server replay does not answer gets 404 and a miss line.

Built-in server replay forwards upstream once its store drains, whatever
server_replay_extra says. Scripts run before it, so this presets a 404 that replay
overwrites on a match (marking the flow is_replay); anything still unmarked at
response time was a miss. Leave server_replay_extra at its default.
"""

import json

from mitmproxy import ctx, http


def load(loader):
    loader.add_option("miss_log", str, "misses.jsonl", "JSONL file, one line per unmatched request")


def request(flow: http.HTTPFlow) -> None:
    flow.response = http.Response.make(404)


def response(flow: http.HTTPFlow) -> None:
    if flow.is_replay == "response":
        return
    with open(ctx.options.miss_log, "a") as log:
        log.write(json.dumps({"method": flow.request.method, "url": flow.request.pretty_url}) + "\n")
