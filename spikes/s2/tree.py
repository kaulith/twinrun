import json, sys
d = json.loads(sys.stdin.read())
def walk(n):
    keys = {k: v for k, v in n.items() if k in ("txt", "a11y", "rid", "hint", "clickable", "b")}
    if any(k in keys for k in ("txt", "a11y", "hint", "rid")) or keys.get("clickable"):
        print(keys)
    for c in n.get("c", []):
        walk(c)
els = d["elements"]
for e in els if isinstance(els, list) else [els]:
    walk(e)
