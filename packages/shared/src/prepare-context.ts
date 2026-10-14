/**
 * The Prepare block the prompt-submit hook injects (ADR-0065). Plain text,
 * because it lands in the model's context and JSON keys are tokens too.
 */

import type { PrepareChange } from "./schemas.js";

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** What the prompt hook adds beside the pack (plan §5.8 H-PROMPT). */
export type PrepareContextExtras = {
  /** The lens for this task, injected once with its procedure (§5.3). */
  readonly lens?: {
    readonly id: string;
    readonly name: string;
    readonly procedure: string;
    readonly conflict?: readonly string[];
  };
  /** One line: how far a change to the top file reaches. */
  readonly blast?: string;
};

export function renderPrepareContext(
  prep: PrepareChange,
  extras: PrepareContextExtras = {},
): string {
  const lines = [`Prism · prepare (auto) for "${clip(prep.pack.task, 120)}"`];
  if (prep.ambiguous) {
    lines.push(
      `"${prep.ambiguous.query}" matches more than one symbol: ${prep.ambiguous.candidates
        .slice(0, 4)
        .map((c) => `${c.symbol} in ${c.path}`)
        .join("; ")}. Ask which one before editing.`,
    );
  }
  if (prep.pack.files.length > 0) {
    lines.push("Open first:");
    for (const file of prep.pack.files.slice(0, 5)) {
      lines.push(
        `- ${file.path}${file.why.length ? ` — ${file.why.slice(0, 2).join(", ")}` : ""}`,
      );
    }
  }
  if (prep.pack.tests.length > 0) {
    lines.push(`Tests: ${prep.pack.tests.slice(0, 5).join(", ")}`);
  }
  if (prep.reuse.length > 0) {
    lines.push(
      `Reuse before writing new code: ${prep.reuse
        .slice(0, 2)
        .map((r) => `${r.symbol} (${r.path})`)
        .join("; ")}`,
    );
  }
  if (prep.order.offLimits.length > 0) {
    lines.push(
      `Off-limits (generated or vendor): ${prep.order.offLimits
        .slice(0, 4)
        .map((o) => o.path)
        .join(", ")}`,
    );
  }
  if (prep.order.needsSignOff.length > 0) {
    lines.push(
      `Ask before editing (high blast): ${prep.order.needsSignOff.slice(0, 4).join(", ")}`,
    );
  }
  if (extras.blast) lines.push(`Blast: ${extras.blast}`);
  for (const note of (prep.notes ?? []).slice(0, 3)) {
    lines.push(`Note (${note.path}): ${clip(note.text, 160)}`);
  }
  if (extras.lens) {
    const conflict =
      extras.lens.conflict && extras.lens.conflict.length > 1
        ? ` (lensConflict: ${extras.lens.conflict.join(", ")}; name one to choose)`
        : "";
    lines.push(`Lens: ${extras.lens.id} (${extras.lens.name})${conflict}`);
    if (extras.lens.procedure.trim()) {
      lines.push(clip(extras.lens.procedure.trim(), 1400));
    }
  }
  lines.push(
    "Paths and names only, no file bodies. Before editing a file not listed here, call blast_radius on it.",
  );
  return lines.join("\n");
}

/** True when the pack is anchored on something the task named. */
export function prepareIsAnchored(prep: PrepareChange): boolean {
  return prep.pack.files.some((file) =>
    file.why.some((why) =>
      [
        "named in task",
        "seed file",
        "path matches task",
        "name matches task",
      ].includes(why),
    ),
  );
}
