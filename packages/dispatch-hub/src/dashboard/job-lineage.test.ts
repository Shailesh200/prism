import { describe, expect, it } from "vitest";
import type { JobSummary } from "@repo-prism/app-shell";
import {
  jobsRelatedTo,
  lineageRoot,
  lineageSummary,
  lineageTree,
} from "./job-lineage.js";

const job = (
  patch: Partial<JobSummary> & Pick<JobSummary, "id" | "status">,
): JobSummary => ({
  title: patch.title ?? patch.id,
  branch: "",
  ...patch,
});

describe("job lineage", () => {
  it("walks parent and nested children from any node", () => {
    const parent = job({ id: "parent", status: "error" });
    const child = job({
      id: "child",
      status: "running",
      parentJobId: "parent",
      origin: "retry",
    });
    const nested = job({
      id: "nested",
      status: "queued",
      parentJobId: "child",
      origin: "reverify",
    });
    const rows = [parent, child, nested];
    expect(
      jobsRelatedTo(rows, child)
        .map((row) => row.id)
        .sort(),
    ).toEqual(["child", "nested", "parent"]);
    expect(lineageRoot(rows, nested).id).toBe("parent");
    const tree = lineageTree(rows, parent);
    expect(tree.children[0]?.job.id).toBe("child");
    expect(tree.children[0]?.children[0]?.job.id).toBe("nested");
  });

  it("stops a cyclic parent chain without hanging", () => {
    const looped = job({
      id: "loop",
      status: "done",
      parentJobId: "loop",
    });
    expect(jobsRelatedTo([looped], looped).map((row) => row.id)).toEqual([
      "loop",
    ]);
    expect(lineageRoot([looped], looped).id).toBe("loop");
  });

  it("summarises a node for the Focus tree", () => {
    expect(
      lineageSummary(
        job({ id: "child", title: "Retry checks", status: "done" }),
      ),
    ).toBe("Retry checks · Done");
  });
});
