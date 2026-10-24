import { Inconclusive } from "./inconclusive.js";

const assetsBranch = "twinrun-assets";
const marker = "<!-- twinrun -->";
const pageSize = 100;

export class GitHub {
  constructor(
    private readonly repo: string,
    private readonly token: string,
  ) {}

  async uploadCrops(crops: Record<string, Buffer>): Promise<Record<string, string>> {
    if (Object.keys(crops).length === 0) return {};
    const refs = (await this.api("GET", `git/matching-refs/heads/${assetsBranch}`)) as { ref: string; object: { sha: string } }[];
    const tip = refs.find((ref) => ref.ref === `refs/heads/${assetsBranch}`)?.object.sha;
    const tree = [];
    for (const [path, png] of Object.entries(crops)) {
      const blob = (await this.api("POST", "git/blobs", { content: png.toString("base64"), encoding: "base64" })) as { sha: string };
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const { sha: treeSha } = (await this.api("POST", "git/trees", { tree })) as { sha: string };
    const { sha } = (await this.api("POST", "git/commits", { message: "twinrun crops", tree: treeSha, parents: tip ? [tip] : [] })) as { sha: string };
    if (tip) await this.api("PATCH", `git/refs/heads/${assetsBranch}`, { sha, force: false });
    else await this.api("POST", "git/refs", { ref: `refs/heads/${assetsBranch}`, sha });
    return Object.fromEntries(Object.keys(crops).map((path) => [path, `https://github.com/${this.repo}/blob/${sha}/${path}?raw=true`]));
  }

  async upsertComment(pr: number, body: string): Promise<string> {
    const text = `${marker}\n${body}`;
    for (let page = 1; ; page++) {
      const comments = (await this.api("GET", `issues/${pr}/comments?per_page=${pageSize}&page=${page}`)) as { id: number; body?: string }[];
      const sticky = comments.find((comment) => comment.body?.startsWith(marker));
      if (sticky) return ((await this.api("PATCH", `issues/comments/${sticky.id}`, { body: text })) as { html_url: string }).html_url;
      if (comments.length < pageSize) break;
    }
    return ((await this.api("POST", `issues/${pr}/comments`, { body: text })) as { html_url: string }).html_url;
  }

  private async api(method: string, path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com/repos/${this.repo}/${path}`, {
        method,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${this.token}`,
          "user-agent": "twinrun",
          "x-github-api-version": "2022-11-28",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Inconclusive(`GitHub ${method} ${path}: ${(error as Error).message}`);
    }
    if (!response.ok) throw new Inconclusive(`GitHub ${method} ${path}: ${response.status}, expected 2xx: ${await response.text()}`);
    return response.json();
  }
}
