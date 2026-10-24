# S4: orphan branch images in a PR comment on a private repo

`kaulith/twinrun` is private. Orphan branch `twinrun-assets` (`db130c6`, no parent) holds one
file, `s4/ranking.jpg`, copied from the dogfood app's `screenshots/`. Draft PR #1 from
`s4-render-probe` (one empty commit on main) carries comment `6251707010`. `comment.md` embeds
the image six ways: branch and SHA pinned blob URLs, the `/raw/` path,
`raw.githubusercontent.com`, a relative path, and an HTML table at width 200 like the D9 base
and head panels.

A logged-out viewer cannot open a private PR, so column C opens each image URL directly
instead: it checks that the assets do not leak, and the expected result is that nothing loads.

## Results

Renders: yes, no (broken image or alt text), or what showed instead.

| Form | A: owner, desktop browser | B: owner, GitHub Mobile | C: logged out, URL direct |
| --- | --- | --- | --- |
| 1 blob, branch, `?raw=true` | yes | yes | 404 |
| 2 blob, SHA, `?raw=true` | yes | yes | 404 |
| 3 `/raw/` path | yes | yes | 404 |
| 4 `raw.githubusercontent.com` | no | no | 404 |
| 5 relative | yes | no: offers Open in browser, which shows "This site can't be reached" | 404, as form 1 |
| 6 HTML table, width 200 | yes, both cells | yes, both cells | 404, as form 1 |

GitHub stored every `src` as written: the comment's `body_html` has no camo proxy and no signed
image URL. Rendering is the viewer's browser fetching each URL with its own github.com session.
Form 5 resolves to form 1's URL from `/pull/1`; from `/pull/1/files` it would resolve to
`/pull/blob/...` and break. Column C was run with `curl` and no credentials.

Columns A and B checked by the owner on 2026-10-24, B in the GitHub Mobile app on their own
phone. Form 4 fails because `raw.githubusercontent.com` does not take the github.com session; a
private repo's raw file there needs a token in the URL. Outcome: D24.

## Not covered

- The comment is posted by the owner, not by `GITHUB_TOKEN` from a `workflow_run` job; whether an
  image renders depends on whether the viewer has access, not on who posted it. P1 checks this
  again with the bot.
- Collaborators without owner rights, and the notification email.
- Whether the SHA URL survives the 30 day prune (`report.md`) rewriting the branch.
