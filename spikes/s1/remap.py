"""Record through a local backend while the app still sees its https origin.

Sends requests for `remap_host` to `remap_upstream` over plain http, then restores the
original origin on the flow so the HAR keeps the URL the app asked for.
"""

from urllib.parse import urlsplit

from mitmproxy import ctx, http


def load(loader):
    loader.add_option("remap_host", str, "", "Host the app requests, e.g. site.example")
    loader.add_option("remap_upstream", str, "", "Where it is served, e.g. http://127.0.0.1:8000")


def request(flow: http.HTTPFlow) -> None:
    if flow.request.pretty_host != ctx.options.remap_host:
        return
    upstream = urlsplit(ctx.options.remap_upstream)
    flow.metadata["origin"] = (flow.request.scheme, flow.request.host, flow.request.port)
    flow.request.scheme = upstream.scheme
    flow.request.host = upstream.hostname
    flow.request.port = upstream.port
    flow.request.host_header = ctx.options.remap_host
    flow.request.headers["X-Forwarded-Proto"] = "https"


def response(flow: http.HTTPFlow) -> None:
    origin = flow.metadata.pop("origin", None)
    if origin:
        flow.request.scheme, flow.request.host, flow.request.port = origin
        del flow.request.headers["X-Forwarded-Proto"]
