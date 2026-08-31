/**
 * Pulling readable text out of a Cursor SDK stream event.
 *
 * The shape is not a stable contract, so every reader is defensive: unknown
 * events yield "" rather than throwing. Shared by the one-line activity
 * (`run-state`) and the append-only console log (`run-log`), which need the
 * same extraction at different lengths.
 */

export function clip(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  if (typeof row.text === "string") return row.text;
  if (Array.isArray(row.content)) {
    return row.content.map(textFromUnknown).filter(Boolean).join(" ");
  }
  if (row.message) return textFromUnknown(row.message);
  return "";
}

export function toolNameFrom(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  if (typeof row.name === "string" && row.name.trim()) return row.name.trim();
  if (typeof row.tool === "string") return row.tool;
  if (row.tool && typeof row.tool === "object") return toolNameFrom(row.tool);
  if (row.message) return toolNameFrom(row.message);
  if (row.delta) return toolNameFrom(row.delta);
  return "";
}

/** Normalised event discriminator (`type` or `kind`), lowercased. */
export function eventType(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  return String(row.type ?? row.kind ?? "").toLowerCase();
}
