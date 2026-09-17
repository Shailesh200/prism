/**
 * Wrapper-over-existing finding source (M-074 B1): an exported function
 * whose entire body is a single call to another exported function — no
 * validation, no transformation, nothing added.
 *
 * Detected structurally, not by reading source text: a reference "inside"
 * a symbol is one whose [start, end) falls within the symbol's own
 * [start, end). Exactly one such call, to a different exported symbol, and
 * a short body, is the signature of a pass-through wrapper. Anything with
 * two or more distinct calls, or a long body, is left alone — that is
 * doing real work, not just forwarding.
 */

import { isTestPath, type FindingRef } from "@repo-prism/shared";
import type { IndexSnapshot } from "@repo-prism/shared";
import { buildKnowledgeGraph } from "../semantic/build.js";
import { computeFindingFingerprint } from "./fingerprint.js";

const WRAPPER_KINDS = new Set(["function"]);
/** A body longer than this has room for real logic, not just a pass-through. */
const MAX_WRAPPER_BODY_CHARS = 160;

export const WRAPPER_OVER_EXISTING_SOURCE = "wrapper_over_existing";

export function listWrapperOverExistingFindings(
  snapshot: IndexSnapshot,
): readonly FindingRef[] {
  const kg = buildKnowledgeGraph(snapshot);
  const symbolsById = new Map(kg.symbols.map((s) => [s.id, s]));
  const referencesByPath = new Map<string, typeof kg.references>();
  for (const ref of kg.references) {
    referencesByPath.set(ref.path, [
      ...(referencesByPath.get(ref.path) ?? []),
      ref,
    ]);
  }

  const findings: FindingRef[] = [];
  for (const symbol of kg.symbols) {
    if (!symbol.exported) continue;
    if (!WRAPPER_KINDS.has(symbol.kind)) continue;
    if (isTestPath(symbol.path)) continue;
    if (symbol.end - symbol.start > MAX_WRAPPER_BODY_CHARS) continue;

    const inBody = (referencesByPath.get(symbol.path) ?? []).filter(
      (r) =>
        r.kind === "call" &&
        r.start >= symbol.start &&
        r.end <= symbol.end &&
        r.targetSymbolId !== null &&
        r.targetSymbolId !== symbol.id,
    );
    const targetIds = new Set(inBody.map((r) => r.targetSymbolId!));
    if (targetIds.size !== 1) continue;

    const target = symbolsById.get([...targetIds][0]!);
    if (!target || !target.exported) continue;
    if (target.path === symbol.path && target.name === symbol.name) continue;

    const title = `"${symbol.name}" in ${symbol.path} wraps "${target.name}" in ${target.path} without adding logic`;
    findings.push({
      id: symbol.id,
      source: WRAPPER_OVER_EXISTING_SOURCE,
      title,
      path: symbol.path,
      fingerprint: computeFindingFingerprint({
        source: WRAPPER_OVER_EXISTING_SOURCE,
        path: symbol.path,
        title,
      }),
    });
  }
  return findings.sort((a, b) => a.id.localeCompare(b.id));
}
