import { describe, expect, it } from "vitest";
import { PICK_REPO, repoSelectOptions } from "./repo-select.js";

const repos = [
  { path: "/a", label: "tmp", jobCount: 0 },
  { path: "/b", label: "Prism", jobCount: 3 },
  { path: "/c", label: "m012-features", jobCount: 0 },
];

describe("repoSelectOptions", () => {
  it("lists only repos that have jobs, plus Select repository", () => {
    const options = repoSelectOptions(repos, "/b");
    expect(options.map((row) => row.value)).toEqual(["/b", PICK_REPO]);
    expect(options.at(-1)?.label).toBe("Select repository…");
  });

  it("keeps the current value even when it has no jobs", () => {
    const options = repoSelectOptions(repos, "/a");
    expect(options.map((row) => row.value)).toEqual(["/b", "/a", PICK_REPO]);
  });

  it("can prefix All repos for the list filter", () => {
    const options = repoSelectOptions(repos, "all", { includeAll: true });
    expect(options[0]).toEqual({ value: "all", label: "All repos" });
  });
});
