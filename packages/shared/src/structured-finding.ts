/**
 * Map existing finding producers into the P18 Finding shape.
 */

import {
  FindingSchema,
  ListedFindingSchema,
  type Finding,
  type FindingRisk,
  type FindingRef,
  type GuardFile,
  type ListedFinding,
} from "./schemas.js";
import type { LensFinding } from "./lenses.js";
import type { ReceiptFlag } from "./receipt.js";

export type { Finding, FindingRisk };

const FLAG_FIX: Record<ReceiptFlag["kind"], string> = {
  duplicate: "Reuse the existing symbol; drop the copy.",
  orphan: "Import it somewhere or delete it.",
  boundary: "Go through the package's public API.",
  "high-blast": "Run the tests that reach it before landing.",
  "slow-type": "Write the return type on the export.",
};

const FLAG_RISK: Record<ReceiptFlag["kind"], FindingRisk> = {
  duplicate: "med",
  orphan: "low",
  boundary: "high",
  "high-blast": "high",
  "slow-type": "med",
};

/** Guard / receipt flag → structured finding. */
export function findingFromReceiptFlag(flag: ReceiptFlag): Finding {
  return FindingSchema.parse({
    what: flag.detail,
    where: flag.path,
    fix: FLAG_FIX[flag.kind],
    riskIfSkipped: FLAG_RISK[flag.kind],
    sources: [`guard:${flag.kind}`],
  });
}

/** Guard session files → structured findings, riskiest file first. */
export function findingsFromGuardFiles(
  files: readonly Pick<GuardFile, "path" | "flags">[],
): Finding[] {
  return mergeFindings(
    files.flatMap((file) =>
      file.flags.map((flag) =>
        findingFromReceiptFlag({
          path: file.path,
          kind: flag.kind,
          detail: flag.detail,
        }),
      ),
    ),
  );
}

const REF_FIX: Record<string, string> = {
  unused_export: "Remove the export or add a real importer.",
  duplicate_implementation: "Keep one implementation and re-export it.",
  wrapper_over_existing: "Call the existing helper directly.",
};

const REF_RISK: Record<string, FindingRisk> = {
  unused_export: "low",
  duplicate_implementation: "med",
  wrapper_over_existing: "med",
};

/** FindingRef (list_findings) → structured finding. */
export function findingFromRef(ref: FindingRef): Finding {
  const source = ref.source;
  return FindingSchema.parse({
    what: ref.title,
    where: ref.path ?? ref.id,
    fix: REF_FIX[source] ?? "Inspect and resolve this finding.",
    riskIfSkipped: REF_RISK[source] ?? "med",
    sources: [source],
  });
}

/** FindingRef → `list_findings` row (structured, keeps mute/queue keys). */
export function listedFindingFromRef(ref: FindingRef): ListedFinding {
  return ListedFindingSchema.parse({
    ...findingFromRef(ref),
    id: ref.id,
    fingerprint: ref.fingerprint,
  });
}

/** Non-pass lens finding → structured findings (one per evidence line, capped). */
export function findingsFromLens(finding: LensFinding): Finding[] {
  if (finding.status === "pass" || finding.status === "overruled") return [];
  const risk: FindingRisk = finding.status === "fail" ? "high" : "med";
  const fix =
    finding.status === "fail"
      ? "Fix this before shipping."
      : "Confirm it is intended.";
  // Edited generated files get the receipt's note, not a finding (J-07).
  const evidence =
    finding.check === "off_limits_touched"
      ? finding.evidence.filter((line) => !line.endsWith(" (generated)"))
      : finding.evidence;
  if (finding.check === "off_limits_touched" && evidence.length === 0) {
    return [];
  }
  const out: Finding[] = [];
  for (const line of evidence.slice(0, 5)) {
    const where = line.split(":")[0]?.trim() || finding.check;
    out.push(
      FindingSchema.parse({
        what: `${finding.check}: ${line}`.slice(0, 300),
        where,
        fix,
        riskIfSkipped: risk,
        sources: [`lens:${finding.lens}:${finding.check}`],
      }),
    );
  }
  if (out.length === 0) {
    out.push(
      FindingSchema.parse({
        what: `${finding.check} ${finding.status}`,
        where: finding.lens,
        fix,
        riskIfSkipped: risk,
        sources: [`lens:${finding.lens}:${finding.check}`],
      }),
    );
  }
  return out;
}

/** Union sources when where+what match (P11 agreement prep). */
export function mergeFindings(items: readonly Finding[]): Finding[] {
  const key = (f: Finding) => `${f.where}\0${f.what}`;
  const map = new Map<string, Finding>();
  const riskRank = { low: 0, med: 1, high: 2 } as const;
  for (const f of items) {
    const k = key(f);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, f);
      continue;
    }
    const sources = [...new Set([...prev.sources, ...f.sources])];
    const riskIfSkipped =
      riskRank[f.riskIfSkipped] > riskRank[prev.riskIfSkipped]
        ? f.riskIfSkipped
        : prev.riskIfSkipped;
    map.set(
      k,
      FindingSchema.parse({
        what: prev.what,
        where: prev.where,
        fix: prev.fix.length <= f.fix.length ? prev.fix : f.fix,
        riskIfSkipped,
        sources,
      }),
    );
  }
  return [...map.values()];
}

/** Collect structured findings from receipt flags + lens findings. */
export function findingsFromReceiptParts(input: {
  readonly flags?: readonly ReceiptFlag[] | undefined;
  readonly lensFindings?: readonly LensFinding[] | undefined;
}): Finding[] {
  const items: Finding[] = [];
  for (const flag of input.flags ?? []) {
    items.push(findingFromReceiptFlag(flag));
  }
  for (const lens of input.lensFindings ?? []) {
    items.push(...findingsFromLens(lens));
  }
  return mergeFindings(items);
}
