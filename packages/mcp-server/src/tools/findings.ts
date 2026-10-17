import { z } from "zod";
import { listedFindingFromRef, ok } from "@repo-prism/shared";
import { boundList, limitInput } from "../limits.js";
import { defineTool } from "../tool-registry.js";

export const listFindings = defineTool({
  name: "list_findings",
  title: "List findings",
  description:
    "Queueable findings from the last index: unused exports, duplicate implementations (two files exporting the exact same name), and wrapper functions (a function whose whole body is one call to another export). Each row is structured: what, where, fix, riskIfSkipped, sources, plus its fingerprint. Excludes findings the user has muted, unless includeMuted is set.",
  inputSchema: {
    limit: limitInput,
    includeMuted: z
      .boolean()
      .optional()
      .describe("Include muted findings too (default false)."),
  },
  readOnly: true,
  async call({ workspace }, args) {
    const found = workspace.listFindings();
    if (!found.ok) return found;
    let findings = found.value.findings;
    if (!args.includeMuted) {
      const muted = await workspace.listMutedFindings();
      if (!muted.ok) return muted;
      const mutedSet = new Set(muted.value);
      findings = findings.filter((f) => !mutedSet.has(f.fingerprint));
    }
    return ok(boundList(findings.map(listedFindingFromRef), args.limit));
  },
});
