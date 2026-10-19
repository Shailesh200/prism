/**
 * `prism review <github pull request url>`.
 *
 * The review uses a checkout Prism has already indexed under
 * `~/.prism/workspaces/<key>`. It does not clone. The comment is posted with
 * the user's `gh` login. Prism stores no token.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { Prism, listIndexedWorkspaces } from "@repo-prism/core";
import { buildChangeReceipt } from "@repo-prism/mcp-server/receipt";
import {
  err,
  ok,
  prismError,
  PrismErrorCode,
  renderReceiptMarkdown,
  type ChangeReviewReport,
  type PrismError,
  type Result,
} from "@repo-prism/shared";
import { reviewToSarif } from "../sarif.js";
import type { CommandContext, CommandOutcome } from "../runtime.js";
import { paint, renderFields, renderHeading } from "../output.js";
import { renderTable, scoreCell } from "../table.js";
import {
  bound,
  meetsThreshold,
  parseFailOn,
  parseLimit,
  truncationNote,
} from "../thresholds.js";

export const STICKY_MARKER = "<!-- prism-review-sticky -->";

const PULL_URL =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/pull\/(\d+)(?:\/(?:files|commits|checks|changes))?\/?(?:[?#].*)?$/i;

export type PullRequestRef = {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly url: string;
};

export type ReviewTarget =
  | { readonly kind: "local" }
  | { readonly kind: "pull"; readonly request: PullRequestRef }
  | { readonly kind: "invalid"; readonly message: string };

export function parsePullRequestUrl(value: string): PullRequestRef | undefined {
  const match = PULL_URL.exec(value.trim());
  if (!match) return undefined;
  const owner = match[1] ?? "";
  const repo = match[2] ?? "";
  const number = Number(match[3]);
  if (!owner || !repo || !Number.isInteger(number)) return undefined;
  return {
    owner,
    repo,
    number,
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

function looksLikeUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value.trim()) || /^github\.com\//i.test(value.trim())
  );
}

/** Local files, one pull request, or a message when the arguments conflict. */
export function classifyReviewTarget(
  positionals: readonly string[],
): ReviewTarget {
  const pulls = positionals.flatMap((value) => {
    const request = parsePullRequestUrl(value);
    return request ? [request] : [];
  });
  const urls = positionals.filter(looksLikeUrl);
  if (pulls.length > 1) {
    return {
      kind: "invalid",
      message: "Review one GitHub pull request at a time.",
    };
  }
  if (pulls.length === 1 && positionals.length > 1) {
    return {
      kind: "invalid",
      message:
        "A pull request URL is reviewed on its own. Leave out the file paths.",
    };
  }
  if (urls.length > 0 && pulls.length === 0) {
    return {
      kind: "invalid",
      message:
        "That URL is not a GitHub pull request. Prism reviews local files, or a github.com/owner/repo/pull/N URL.",
    };
  }
  const request = pulls[0];
  if (request) return { kind: "pull", request };
  return { kind: "local" };
}

export type GithubSlug = { readonly owner: string; readonly repo: string };

/** `owner/repo` from an origin URL. GitHub only. */
export function githubSlug(remote: string): GithubSlug | undefined {
  const text = remote.trim().replace(/\.git$/i, "");
  const ssh = /^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/([^/]+)$/i.exec(text);
  const https = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)$/i.exec(
    text,
  );
  const match = ssh ?? https;
  if (!match?.[1] || !match[2]) return undefined;
  return { owner: match[1], repo: match[2] };
}

export function sameRepo(left: GithubSlug, right: GithubSlug): boolean {
  return (
    left.owner.toLowerCase() === right.owner.toLowerCase() &&
    left.repo.toLowerCase() === right.repo.toLowerCase()
  );
}

export type CheckoutCandidate = {
  readonly root: string;
  readonly remote: string | null;
  readonly exists: boolean;
  readonly indexedAt: number;
  readonly cwd: boolean;
};

/**
 * The checkout to review from. The current directory wins when it is that
 * repo. Otherwise the newest indexed checkout of the same GitHub repo.
 */
export function chooseCheckout(
  slugs: readonly GithubSlug[],
  candidates: readonly CheckoutCandidate[],
): { readonly root: string } | { readonly message: string } {
  const label = slugs.map((slug) => `${slug.owner}/${slug.repo}`).join(" or ");
  const matches = candidates.filter((candidate) => {
    if (!candidate.exists || !candidate.remote) return false;
    const remote = githubSlug(candidate.remote);
    return remote !== undefined && slugs.some((slug) => sameRepo(remote, slug));
  });
  const here = matches.find((candidate) => candidate.cwd);
  if (here) return { root: here.root };
  const newest = [...matches].sort((a, b) => b.indexedAt - a.indexedAt)[0];
  if (newest) return { root: newest.root };
  return {
    message: `No indexed checkout of ${label}. Open that repository once so Prism can index it, then review the pull request again.`,
  };
}

export type GhResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly missing?: boolean;
};

export type GhRunner = (args: readonly string[], input?: string) => GhResult;

export function ghRunner(env: NodeJS.ProcessEnv = process.env): GhRunner {
  const bin = env.PRISM_GH?.trim() || "gh";
  return (args, input) => {
    const result = spawnSync(bin, [...args], {
      encoding: "utf8",
      input,
      timeout: 30_000,
      env,
    });
    const missing =
      result.error !== undefined &&
      (result.error as NodeJS.ErrnoException).code === "ENOENT";
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? result.error?.message ?? "",
      ...(missing ? { missing: true } : {}),
    };
  };
}

type PullFile = { readonly path?: string };

type PullView = {
  readonly number?: number;
  readonly baseRefName?: string;
  readonly headRefOid?: string;
  readonly url?: string;
  readonly files?: readonly PullFile[];
  readonly headRepository?: { readonly name?: string };
  readonly headRepositoryOwner?: { readonly login?: string };
};

export function pullFiles(view: PullView): string[] {
  const paths = (view.files ?? []).flatMap((file) =>
    typeof file.path === "string" &&
    file.path.length > 0 &&
    !file.path.includes("..")
      ? [file.path.replace(/\\/g, "/")]
      : [],
  );
  return [...new Set(paths)];
}

export function readPullView(stdout: string): PullView | undefined {
  try {
    const parsed = JSON.parse(stdout) as PullView;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function oneLine(text: string): string {
  const line = text.split("\n").find((item) => item.trim().length > 0) ?? "";
  return line.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function renderReviewComment(
  review: ChangeReviewReport,
  receiptMarkdown: string,
  note: string,
): string {
  const risk = Math.round(Number(review.overallRisk ?? 0));
  const base = review.base ?? "working tree";
  const items = review.items ?? [];
  const lines = [
    STICKY_MARKER,
    "",
    "## Prism change review",
    "",
    "| | |",
    "|---|---|",
    `| Base | \`${base}\` |`,
    `| Overall risk | **${risk}/100** |`,
    `| Changed files | ${items.length} |`,
    `| Affected files | ${review.totalAffectedFiles ?? 0} |`,
    `| Tests likely affected | ${review.totalTestsAffected ?? 0} |`,
    "",
    note,
    "",
  ];
  if (items.length === 0) {
    lines.push("_No changes to review._", "");
  } else {
    lines.push(
      "### Per-file blast",
      "",
      "| File | Risk | Affects | Tests |",
      "|---|---:|---:|---:|",
    );
    const sorted = [...items].sort((a, b) => b.risk - a.risk);
    for (const item of sorted.slice(0, 25)) {
      lines.push(
        `| \`${item.path}\` | ${Math.round(item.risk)} | ${item.affectedFilesCount} | ${item.testsLikelyAffected.length} |`,
      );
    }
    if (sorted.length > 25) {
      lines.push("", `_…and ${sorted.length - 25} more changed files._`);
    }
    const tests = [
      ...new Set(sorted.flatMap((item) => item.testsLikelyAffected)),
    ].slice(0, 20);
    lines.push("", "### Tests to run", "");
    if (tests.length === 0)
      lines.push("_No likely-affected tests reported._", "");
    else lines.push(...tests.map((test) => `- \`${test}\``), "");
  }
  const receipt = receiptMarkdown.trim();
  if (receipt) lines.push("### Receipt", "", receipt, "");
  lines.push(
    "<sub>Posted by `prism review`. Re-runs update this comment in place.</sub>",
    "",
  );
  return lines.join("\n");
}

type CommentRecord = { readonly id?: number; readonly body?: string };

export function commentUpdate(
  listed: readonly CommentRecord[],
): { readonly id: number } | undefined {
  const existing = listed.find(
    (comment) =>
      typeof comment.id === "number" &&
      typeof comment.body === "string" &&
      comment.body.includes(STICKY_MARKER),
  );
  return existing?.id === undefined ? undefined : { id: existing.id };
}

export type PostedComment =
  | { readonly posted: true; readonly updated: boolean }
  | { readonly posted: false; readonly reason: string };

export function postReviewComment(
  request: PullRequestRef,
  body: string,
  gh: GhRunner,
): PostedComment {
  const list = gh([
    "api",
    "--paginate",
    `repos/${request.owner}/${request.repo}/issues/${request.number}/comments`,
  ]);
  if (list.missing) {
    return { posted: false, reason: "The GitHub CLI (gh) is not installed." };
  }
  if (list.status !== 0) {
    return {
      posted: false,
      reason:
        oneLine(list.stderr) || "The existing comments could not be read.",
    };
  }
  let records: CommentRecord[] = [];
  try {
    const parsed = JSON.parse(list.stdout) as unknown;
    if (Array.isArray(parsed)) records = parsed as CommentRecord[];
  } catch {
    records = [];
  }
  const existing = commentUpdate(records);
  const path = existing
    ? `repos/${request.owner}/${request.repo}/issues/comments/${existing.id}`
    : `repos/${request.owner}/${request.repo}/issues/${request.number}/comments`;
  const method = existing ? "PATCH" : "POST";
  const sent = gh(
    ["api", "--method", method, path, "--input", "-"],
    JSON.stringify({ body: body.slice(0, 60_000) }),
  );
  if (sent.missing) {
    return { posted: false, reason: "The GitHub CLI (gh) is not installed." };
  }
  if (sent.status !== 0) {
    return {
      posted: false,
      reason: oneLine(sent.stderr) || "The review comment was not posted.",
    };
  }
  return { posted: true, updated: existing !== undefined };
}

function gitText(args: readonly string[], cwd: string): string | null {
  const result = spawnSync("git", [...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  const text = (result.stdout ?? "").trim();
  return text.length > 0 ? text : null;
}

function sameCommit(
  localHead: string | null,
  pullHead: string | undefined,
): boolean {
  if (!localHead || !pullHead) return false;
  return localHead.startsWith(pullHead) || pullHead.startsWith(localHead);
}

function checkoutNote(
  localHead: string | null,
  pullHead: string | undefined,
): string {
  const local = (localHead ?? "unknown").slice(0, 12);
  if (pullHead && !sameCommit(localHead, pullHead)) {
    return `Reviewed from the indexed checkout at \`${local}\`. The pull request head is \`${pullHead.slice(0, 12)}\`, so this is that checkout's view of these files.`;
  }
  return `Reviewed from the indexed checkout at \`${local}\`.`;
}

function emptyReview(base: string): ChangeReviewReport {
  return {
    generatedAt: new Date().toISOString(),
    base,
    items: [],
    overallRisk: 0,
    totalAffectedFiles: 0,
    totalTestsAffected: 0,
    totalBreakingChanges: 0,
  };
}

export async function reviewPullRequestCommand(
  context: CommandContext,
  request: PullRequestRef,
): Promise<Result<CommandOutcome, PrismError>> {
  const gh = ghRunner(process.env);
  context.progress(`Reading ${request.url} …`);
  const viewed = gh([
    "pr",
    "view",
    request.url,
    "--json",
    "number,baseRefName,headRefOid,url,files,headRepository,headRepositoryOwner",
  ]);
  if (viewed.missing) {
    return err(
      prismError(
        PrismErrorCode.UNSUPPORTED,
        "The GitHub CLI (gh) is not installed, so the pull request could not be read.",
      ),
    );
  }
  if (viewed.status !== 0) {
    return err(
      prismError(
        PrismErrorCode.UNSUPPORTED,
        `The pull request could not be read. ${oneLine(viewed.stderr) || "Check gh auth login."}`,
      ),
    );
  }
  const view = readPullView(viewed.stdout);
  if (!view) {
    return err(
      prismError(
        PrismErrorCode.UNSUPPORTED,
        "The pull request details were not valid JSON.",
      ),
    );
  }
  const failOn = parseFailOn(context.args.option("failOn"));
  if (!failOn.ok) return failOn;
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const files = pullFiles(view);
  const base = view.baseRefName ?? "the pull request base";
  const headOwner = view.headRepositoryOwner?.login;
  const headRepo = view.headRepository?.name;
  const slugs = [
    { owner: request.owner, repo: request.repo },
    ...(headOwner && headRepo ? [{ owner: headOwner, repo: headRepo }] : []),
  ];
  const indexed = listIndexedWorkspaces(process.env);
  const candidates: CheckoutCandidate[] = [
    {
      root: context.workspace.path,
      remote: gitText(["remote", "get-url", "origin"], context.workspace.path),
      exists: existsSync(context.workspace.path),
      indexedAt: Number.MAX_SAFE_INTEGER,
      cwd: true,
    },
    ...indexed.map((workspace) => ({
      root: workspace.root,
      remote: gitText(["remote", "get-url", "origin"], workspace.root),
      exists: existsSync(workspace.root),
      indexedAt: workspace.indexedAt,
      cwd: false,
    })),
  ];
  const chosen = chooseCheckout(slugs, candidates);
  if ("message" in chosen) {
    return err(prismError(PrismErrorCode.NOT_FOUND, chosen.message));
  }

  const opened = Prism.create().openRepository(chosen.root);
  if (!opened.ok) return opened;
  const workspace = opened.value;
  try {
    context.progress(`Indexing ${chosen.root} …`);
    const indexedNow = await workspace.index();
    if (!indexedNow.ok) return indexedNow;
    let review: ChangeReviewReport;
    if (files.length === 0) {
      review = emptyReview(base);
    } else {
      const reported = await workspace.reviewChanges({ paths: files, base });
      if (!reported.ok) return reported;
      review = reported.value;
    }

    context.progress("Building the receipt …");
    const receipt = await buildChangeReceipt(workspace, {
      changedPaths: files,
      env: process.env,
    });
    const receiptMarkdown = receipt.ok
      ? renderReceiptMarkdown(receipt.value)
      : "";
    const head = gitText(["rev-parse", "HEAD"], chosen.root);
    const note = checkoutNote(head, view.headRefOid);
    const body = renderReviewComment(review, receiptMarkdown, note);
    context.progress("Posting the review comment …");
    const comment = postReviewComment(request, body, gh);
    const findings = meetsThreshold(review.overallRisk, failOn.value);
    if (context.args.option("format") === "sarif") {
      context.writer.err(
        comment.posted
          ? `Review comment ${comment.updated ? "updated" : "posted"} on ${request.url}.`
          : `Review comment was not posted. ${comment.reason}`,
      );
      return ok({
        data: reviewToSarif(review),
        rawJson: true,
        findings,
        human: () => "",
      });
    }
    return ok({
      data: {
        ...review,
        pullRequest: {
          url: request.url,
          number: request.number,
          head: view.headRefOid ?? null,
          checkoutHead: head,
        },
        receipt: receipt.ok ? receipt.value : null,
        comment,
      },
      findings,
      human({ color, width }) {
        const items = bound(review.items, limit.value);
        const lines = [
          renderHeading("Change review", color),
          "",
          renderFields(
            [
              ["Pull request", request.url],
              ["Base", review.base ?? base],
              ["Checkout", note],
              ["Changed files", String(review.items.length)],
              ["Affected files", String(review.totalAffectedFiles)],
            ],
            color,
          ),
          "",
          renderTable({
            columns: [
              { header: "CHANGED FILE", flex: true },
              { header: "RISK", align: "right" },
              { header: "AFFECTS", align: "right" },
              { header: "TESTS", align: "right" },
            ],
            rows: items.items.map((item) => [
              { text: item.path },
              scoreCell(item.risk),
              { text: String(item.affectedFilesCount) },
              { text: String(item.testsLikelyAffected.length) },
            ]),
            color,
            width,
          }),
        ];
        const truncated = truncationNote(items, "changed files");
        if (truncated) lines.push(paint(truncated, "dim", color));
        if (receiptMarkdown) lines.push("", receiptMarkdown);
        else if (!receipt.ok) {
          lines.push("", `Receipt: ${receipt.error.message}`);
        }
        lines.push(
          "",
          comment.posted
            ? `Review comment ${comment.updated ? "updated" : "posted"} on ${request.url}.`
            : `Review comment was not posted. ${comment.reason}`,
        );
        return lines.join("\n");
      },
    });
  } finally {
    workspace.close();
  }
}
