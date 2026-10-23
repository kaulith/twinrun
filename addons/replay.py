import json
from collections.abc import Sequence

from mitmproxy import ctx, http, io


class Replay:
    def __init__(self) -> None:
        self.recordings: dict[tuple[str, str, bytes], list[http.Response]] = {}

    def load(self, loader) -> None:
        loader.add_option("har", str, "", "HAR file to replay")
        loader.add_option("backend_hosts", Sequence[str], [], "hosts the app's own backend serves")
        loader.add_option("misses", str, "misses.jsonl", "JSONL file, one line per unmatched request")

    def configure(self, updated: set[str]) -> None:
        if "har" in updated:
            self.recordings = {}
            for flow in io.read_flows_from_paths([ctx.options.har]):
                self.recordings.setdefault(key(flow.request), []).append(flow.response)

    def request(self, flow: http.HTTPFlow) -> None:
        recorded = self.recordings.get(key(flow.request))
        if recorded:
            flow.response = (recorded.pop(0) if len(recorded) > 1 else recorded[0]).copy()
            return
        flow.response = http.Response.make(404)
        miss = {"method": flow.request.method, "url": flow.request.pretty_url, "backend": flow.request.pretty_host in ctx.options.backend_hosts}
        with open(ctx.options.misses, "a") as misses:
            misses.write(json.dumps(miss) + "\n")


def key(request: http.Request) -> tuple[str, str, bytes]:
    return request.method, request.pretty_url, request.get_content(strict=False) or b""


addons = [Replay()]
