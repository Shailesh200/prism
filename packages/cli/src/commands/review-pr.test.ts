import { describe, expect, it } from "vitest";
import {
  chooseCheckout,
  classifyReviewTarget,
  commentUpdate,
  githubSlug,
  parsePullRequestUrl,
  postReviewComment,
  pullFiles,
  renderReviewComment,
  STICKY_MARKER,
  type GhResult,
} from "./review-pr.js";

describe("prism review targets", () => {
  it("keeps local files local", () => {
    expect(classifyReviewTarget([])).toEqual({ kind: "local" });
    expect(classifyReviewTarget(["src/app.ts"])).toEqual({ kind: "local" });
  });

  it("accepts a GitHub pull request URL", () => {
    const target = classifyReviewTarget([
      "https://github.com/Shailesh200/prism/pull/12/files?diff=unified",
    ]);
    expect(target).toMatchObject({
      kind: "pull",
      request: {
        owner: "Shailesh200",
        repo: "prism",
        number: 12,
        url: "https://github.com/Shailesh200/prism/pull/12",
      },
    });
    expect(parsePullRequestUrl("github.com/org/repo/pull/3")).toMatchObject({
      number: 3,
    });
  });

  it("rejects a mix, two pull requests, and a non-GitHub URL", () => {
    expect(
      classifyReviewTarget(["https://github.com/a/b/pull/1", "src/a.ts"]),
    ).toMatchObject({
      kind: "invalid",
    });
    expect(
      classifyReviewTarget([
        "https://github.com/a/b/pull/1",
        "https://github.com/a/b/pull/2",
      ]),
    ).toMatchObject({ kind: "invalid" });
    expect(
      classifyReviewTarget(["https://gitlab.com/a/b/-/merge_requests/1"]),
    ).toMatchObject({
      kind: "invalid",
    });
  });
});

describe("indexed checkout", () => {
  it("reads owner and repo from https and ssh remotes", () => {
    expect(githubSlug("https://github.com/Org/Repo.git")).toEqual({
      owner: "Org",
      repo: "Repo",
    });
    expect(githubSlug("git@github.com:Org/Repo.git")).toEqual({
      owner: "Org",
      repo: "Repo",
    });
  });

  it("prefers the current checkout, then the newest indexed one", () => {
    const slug = { owner: "Org", repo: "Repo" };
    const older = {
      root: "/older",
      remote: "git@github.com:org/repo.git",
      exists: true,
      indexedAt: 1,
      cwd: false,
    };
    const newer = { ...older, root: "/newer", indexedAt: 5 };
    const here = { ...older, root: "/here", cwd: true, indexedAt: 0 };
    expect(chooseCheckout([slug], [here, newer])).toEqual({ root: "/here" });
    expect(chooseCheckout([slug], [older, newer])).toEqual({ root: "/newer" });
    expect(chooseCheckout([slug], [{ ...older, exists: false }])).toMatchObject(
      {
        message: expect.stringContaining("Org/Repo"),
      },
    );
    expect(
      chooseCheckout(
        [
          { owner: "Upstream", repo: "Repo" },
          { owner: "Org", repo: "Repo" },
        ],
        [older],
      ),
    ).toEqual({ root: "/older" });
  });
});

describe("pull request comment", () => {
  const review = {
    generatedAt: "2026-10-19T00:00:00.000Z",
    base: "main",
    items: [
      {
        path: "src/app.ts",
        risk: 40,
        affectedFilesCount: 2,
        testsLikelyAffected: ["src/app.test.ts"],
        breakingChanges: [],
      },
    ],
    overallRisk: 40,
    totalAffectedFiles: 2,
    totalTestsAffected: 1,
    totalBreakingChanges: 0,
  };

  it("includes the receipt and drops a path from the note", () => {
    const body = renderReviewComment(
      review,
      "### Verdict\nproven",
      "Reviewed from the indexed checkout at `abc`.",
    );
    expect(body).toContain(STICKY_MARKER);
    expect(body).toContain("src/app.ts");
    expect(body).toContain("### Receipt");
    expect(body).toContain("proven");
    expect(body).not.toContain("/Users");
  });

  it("updates the sticky comment instead of adding another", () => {
    const calls: string[][] = [];
    const gh = (args: readonly string[], input?: string): GhResult => {
      calls.push([...args, input ?? ""]);
      if (args[0] === "api" && args[1] === "--paginate") {
        return {
          status: 0,
          stdout: JSON.stringify([{ id: 9, body: `${STICKY_MARKER}\nold` }]),
          stderr: "",
        };
      }
      return { status: 0, stdout: "", stderr: "" };
    };
    const posted = postReviewComment(
      {
        owner: "Org",
        repo: "Repo",
        number: 4,
        url: "https://github.com/Org/Repo/pull/4",
      },
      "hello",
      gh,
    );
    expect(posted).toEqual({ posted: true, updated: true });
    expect(calls[1]?.join(" ")).toContain("PATCH");
    expect(commentUpdate([{ id: 9, body: "no marker" }])).toBeUndefined();
  });

  it("keeps the review when the comment cannot be posted", () => {
    const posted = postReviewComment(
      {
        owner: "Org",
        repo: "Repo",
        number: 4,
        url: "https://github.com/Org/Repo/pull/4",
      },
      "hello",
      () => ({ status: 1, stdout: "", stderr: "permission denied" }),
    );
    expect(posted).toEqual({
      posted: false,
      reason: "permission denied",
    });
  });

  it("uses the pull request files and ignores a path escape", () => {
    expect(
      pullFiles({
        files: [
          { path: "src/app.ts" },
          { path: "../etc/passwd" },
          { path: "src/app.ts" },
        ],
      }),
    ).toEqual(["src/app.ts"]);
  });
});
