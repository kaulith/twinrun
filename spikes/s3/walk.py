"""Walks reverse references from a commit's changed source files to registry screens.

Nodes are source files, not classes: Kotlin splits one file into a file class, Compose
singletons and lambda classes, and a hop between those is not a hop a reviewer would count.

    python3 -I walk.py <dump.tsv> <worktree> <commit> <registry.json> <hand.json> [--dispatch]

A reached container's file reaches every screen it hosts; nav graph files are never walked
past. --dispatch also steps from each reached file to its supertypes' files at no hop cost,
so callers that hold an interface reach its implementation.
"""

import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

MAX_HOPS = 2
REPORT_HOPS = 3


def load_dump(path):
    file_of, methods, users, supertypes = {}, defaultdict(set), defaultdict(set), defaultdict(set)
    rows = [line.split("\t") for line in Path(path).read_text().splitlines()]
    for _, name, pkg, source, declared in (r for r in rows if r[0] == "class"):
        file_of[name] = (pkg, source)
        methods[name] = set(filter(None, declared.split(",")))
    # A lambda inlined from a library carries the library's SourceFile; it belongs to its outer class.
    for name in file_of:
        file_of[name] = file_of.get(name.split("$")[0], file_of[name])
    for kind, frm, to in (r for r in rows if r[0] != "class"):
        a, b = file_of[frm], file_of.get(to)
        if b is None or a == b:
            continue
        if kind == "dep":
            users[b].add(a)
        else:
            supertypes[a].add(b)
    return file_of, methods, users, supertypes


def changed_files(worktree, commit):
    out = subprocess.run(["git", "-C", worktree, "diff-tree", "--no-commit-id", "--name-only", "-r", commit],
                         capture_output=True, text=True, check=True).stdout.split()
    keys = {}
    for path in out:
        source = Path(worktree, path)
        if source.suffix not in (".kt", ".java") or not source.exists():
            keys[path] = None
            continue
        package = re.search(r"^package\s+([\w.]+)", source.read_text(), re.M)
        keys[path] = (package.group(1) if package else "", source.name)
    return keys


def screen_files(registry, file_of, methods):
    def owner(composable):
        pkg, fn = composable.rsplit(".", 1)
        owners = {file_of[c] for c in file_of if file_of[c][0] == pkg and fn in methods[c] and "$" not in c}
        if len(owners) != 1:
            sys.exit(f"{len(owners)} files declare {composable}")
        return owners.pop()

    shows = defaultdict(set)
    for entry in registry["screens"] + registry["containers"]:
        shows[owner(entry["composable"])].update(entry.get("screens", [entry["id"]]))
    return shows, {owner(c) for c in registry["navGraphs"]}


def walk(starts, users, supertypes, dispatch, sinks):
    hop, parent, frontier = {s: 0 for s in starts}, {}, list(starts)
    for depth in range(1, REPORT_HOPS + 1):
        if dispatch:
            for node in list(frontier):
                for sup in supertypes[node] - hop.keys():
                    hop[sup], parent[sup] = depth - 1, node
                    frontier.append(sup)
        nxt = []
        for node in frontier:
            if node in sinks:
                continue
            for user in users[node] - hop.keys():
                hop[user], parent[user] = depth, node
                nxt.append(user)
        frontier = nxt
    return hop, parent


def chain(node, parent):
    names = [node[1]]
    while node in parent:
        node = parent[node]
        names.append(node[1])
    return " <- ".join(names)


def main():
    dump, worktree, commit, registry_path, hand_path = sys.argv[1:6]
    dispatch = "--dispatch" in sys.argv
    file_of, methods, users, supertypes = load_dump(dump)
    shows, sinks = screen_files(json.loads(Path(registry_path).read_text()), file_of, methods)
    hand = next(p for p in json.loads(Path(hand_path).read_text())["prs"] if commit.startswith(p["commit"]))

    changed = changed_files(worktree, commit)
    starts = {k for k in changed.values() if k in set(file_of.values())}
    hop, parent = walk(starts, users, supertypes, dispatch, sinks)
    reached = {}
    for f in sorted(shows.keys() & hop.keys(), key=hop.get, reverse=True):
        reached.update({s: (hop[f], chain(f, parent)) for s in shows[f]})
    graph = {s for s, (h, _) in reached.items() if h <= MAX_HOPS}
    expected = set(hand["screens"])

    result = {
        "pr": hand["pr"],
        "commit": commit,
        "dispatch": dispatch,
        "changed": {path: ("unmapped" if key not in starts else key[1]) for path, key in changed.items()},
        "files_reached": {h: sum(1 for v in hop.values() if v == h) for h in range(REPORT_HOPS + 1)},
        "screens": {s: {"hop": h, "chain": c} for s, (h, c) in sorted(reached.items(), key=lambda i: i[1][0])},
        "hits": sorted(graph & expected),
        "misses": sorted(expected - graph),
        "extras": sorted(graph - expected),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
