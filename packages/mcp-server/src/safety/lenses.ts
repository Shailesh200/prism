/**
 * Lenses (ADR-0059) on the MCP side: evidence for a review and the brief the
 * host's model runs. Prism calls no model. Storage is the shared lens store.
 */

import type { PrismWorkspace } from "@repo-prism/core";
import {
  isTestPath,
  ok,
  type LensDefinition,
  type LensEvidence,
  type LensFact,
  type PrismError,
  type Result,
} from "@repo-prism/shared";
import {
  readLensStore,
  seedLenses,
  type LensStore,
} from "@repo-prism/shared/lens-store";

const EVIDENCE_CAP = 16;
const CHANGE_FILES = 8;

/** Evidence lines for one lens, read from the index and the current change. */
export async function evidenceFor(
  workspace: PrismWorkspace,
  kinds: readonly LensEvidence[],
  task: string,
): Promise<string[]> {
  const lines: string[] = [`Task: ${task.slice(0, 300)}`];
  const wants = (...k: LensEvidence[]) =>
    k.some((kind) => kinds.includes(kind));

  if (wants("boundaries", "duplicates", "blast", "test-impact")) {
    const guard = await workspace.guardSession();
    const files = guard.ok ? guard.value.files.slice(0, CHANGE_FILES) : [];
    if (!guard.ok) {
      lines.push(`Changed files: unavailable (${guard.error.message}).`);
    } else if (files.length === 0) {
      lines.push("Changed files: none. Reviewing the task only.");
    } else {
      lines.push(
        `Changed files (${guard.value.files.length}): ${files.map((f) => f.path).join(", ")}`,
      );
    }
    for (const file of files) {
      for (const flag of file.flags) {
        if (
          (flag.kind === "boundary" && kinds.includes("boundaries")) ||
          (flag.kind === "duplicate" && kinds.includes("duplicates"))
        ) {
          lines.push(`${flag.kind}: ${file.path} — ${flag.detail}`);
        }
      }
      if (kinds.includes("blast")) {
        lines.push(`blast: ${file.path} risk ${Math.round(file.risk)}`);
      }
    }
    if (kinds.includes("test-impact")) {
      for (const file of files.filter((f) => !isTestPath(f.path)).slice(0, 6)) {
        const impact = await workspace.testImpact({
          kind: "file",
          id: file.path,
        });
        const tests = impact.ok ? impact.value.tests.map((t) => t.path) : [];
        lines.push(
          tests.length === 0
            ? `tests: no test reaches ${file.path}`
            : `tests: ${file.path} is reached by ${tests.length} (e.g. ${tests[0]})`,
        );
      }
    }
  }

  if (kinds.includes("cycles")) {
    const cycles = workspace.getCycles();
    if (cycles.ok) {
      lines.push(
        cycles.value.length === 0
          ? "cycles: none"
          : `cycles: ${cycles.value.length}, first ${cycles.value[0]?.slice(0, 4).join(" → ") ?? ""}`,
      );
    }
  }

  if (wants("test-layout", "verify-plan")) {
    const dna = await workspace.getDna();
    if (dna.ok) {
      lines.push(
        dna.value.testRunners.length > 0
          ? `test runners: ${dna.value.testRunners.join(", ")}`
          : "test runners: none detected",
      );
    }
  }

  if (wants("reuse", "house-style", "off-limits", "rationale")) {
    const prepared = await workspace.prepareChange({ task });
    if (prepared.ok) {
      const value = prepared.value;
      if (kinds.includes("off-limits")) {
        const sample = value.order.offLimits.slice(0, 5).map((row) => row.path);
        lines.push(
          sample.length === 0
            ? "off-limits: none in scope"
            : `off-limits (${value.order.offLimits.length}): ${sample.join(", ")}`,
        );
      }
      if (kinds.includes("reuse")) {
        lines.push(
          value.reuse.length === 0
            ? "reuse: no existing helper matched the task"
            : `reuse: ${value.reuse
                .slice(0, 5)
                .map((hit) => `${hit.symbol} in ${hit.path}`)
                .join("; ")}`,
        );
      }
      if (kinds.includes("house-style") && value.conventions?.length) {
        lines.push(
          `house style: ${value.conventions
            .slice(0, 3)
            .map((row) => `${row.patternId} ${row.path}`)
            .join("; ")}`,
        );
      }
      if (kinds.includes("rationale")) {
        for (const note of (value.notes ?? []).slice(0, 3)) {
          lines.push(
            `note (${note.source}) ${note.path}: ${note.text.slice(0, 180)}`,
          );
        }
      }
    }
  }
  return lines.slice(0, EVIDENCE_CAP);
}

export type LensBrief = {
  readonly lens: LensDefinition;
  readonly facts: readonly LensFact[];
  readonly evidence: readonly string[];
  readonly instruction: string;
};

const BRIEF_INSTRUCTION =
  'You are this lens. Judge only your checklist. Every failed item must cite a path or a command from the evidence. Reply with JSON {"verdict":"pass|concern|fail","summary":"one line","reasoning":"...","failedChecks":[]}.';

async function storeFor(
  workspace: PrismWorkspace,
  env: NodeJS.ProcessEnv,
): Promise<LensStore> {
  const store = await readLensStore(workspace.rootPath, env);
  return store.lenses.length > 0 ? store : seedLenses(workspace, env);
}

export async function briefsFor(
  workspace: PrismWorkspace,
  ids: readonly string[] | undefined,
  task: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<LensBrief[], PrismError>> {
  const store = await storeFor(workspace, env);
  const enabled = store.lenses.filter((row) => row.enabled);
  const wanted = new Set(ids ?? enabled.map((row) => row.id));
  const briefs: LensBrief[] = [];
  for (const lens of enabled) {
    if (!wanted.has(lens.id)) continue;
    briefs.push({
      lens,
      facts: store.facts.filter((row) => row.lens === lens.id),
      evidence: await evidenceFor(workspace, lens.evidence, task),
      instruction: BRIEF_INSTRUCTION,
    });
  }
  return ok(briefs);
}
