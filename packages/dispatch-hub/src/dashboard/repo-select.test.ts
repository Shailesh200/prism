import { describe, expect, it } from "vitest";
import { PICK_REPO, repoSelectOptions } from "./repo-select.js";

const repos = [
  { path: "/a", label: "tmp", jobCount: 0 },
  { path: "/b", label: "Prism", jobCount: 3 },
  { path: "/c", label: "m012-features", jobCount: 0 },
];

describe("repoSelectOptions", () => {
  it("lists every registered repo so switching after the first pick still works", () => {
    const options = repoSelectOptions(repos, "/b");
    expect(options.map((row) => row.value)).toEqual([
      "/a",
      "/b",
      "/c",
      PICK_REPO,
    ]);
    expect(options.at(-1)?.label).toBe("Select repository…");
  });

  it("can keep a jobs-only list when asked", () => {
    const options = repoSelectOptions(repos, "/a", { jobsOnly: true });
    expect(options.map((row) => row.value)).toEqual(["/b", "/a", PICK_REPO]);
  });

  it("can prefix All repos for the list filter", () => {
    const options = repoSelectOptions(repos, "all", { includeAll: true });
    expect(options[0]).toEqual({ value: "all", label: "All repos" });
  });
});
