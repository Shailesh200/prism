/**
 * Lightweight markdown for Dispatch findings.
 *
 * Job notes are GFM-ish (headings, lists, pipe tables, fences). A full
 * library would pull a parser into every surface that mounts app-shell;
 * this is enough for the write-ups workers actually leave.
 */

export type MdHeading = {
  readonly type: "heading";
  readonly depth: 1 | 2 | 3 | 4;
  readonly text: string;
};
export type MdParagraph = { readonly type: "paragraph"; readonly text: string };
export type MdList = {
  readonly type: "list";
  readonly items: readonly string[];
};
export type MdTable = {
  readonly type: "table";
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
};
export type MdCode = {
  readonly type: "code";
  readonly text: string;
  readonly lang?: string;
};
export type MdBlock = MdHeading | MdParagraph | MdList | MdTable | MdCode;

const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

export function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.includes("|", 1);
}

export function isTableSep(line: string): boolean {
  return TABLE_SEP.test(line);
}

export function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function headingDepth(line: string): 1 | 2 | 3 | 4 | undefined {
  const match = line.match(/^(#{1,4})\s+\S/);
  if (!match) return undefined;
  const n = match[1]?.length ?? 1;
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return undefined;
}

/**
 * Thinking logs often arrive as one wrapped paragraph: "foo. - **bar** — …".
 * A leading "- **bold**" or "- `code`" on its own line is a list; the same
 * markers jammed after a space are still meant as items.
 */
export function prepareMarkdown(source: string): string {
  return source.replace(/\r\n/g, "\n").replace(/\s+-\s+(?=\*\*|`)/g, "\n- ");
}

export function parseMarkdown(source: string): MdBlock[] {
  const lines = prepareMarkdown(source).split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim() || undefined;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({
        type: "code",
        text: body.join("\n"),
        ...(lang ? { lang } : {}),
      });
      continue;
    }
    const next = lines[i + 1] ?? "";
    if (isTableRow(line) && isTableSep(next)) {
      const headers = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i] ?? "")) {
        const row = lines[i] ?? "";
        if (!isTableSep(row)) rows.push(splitTableRow(row));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    const depth = headingDepth(line);
    if (depth) {
      blocks.push({
        type: "heading",
        depth,
        text: line.replace(/^#+\s+/, ""),
      });
      i += 1;
      continue;
    }
    if (/^[-*]\s+\S/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        if (/^[-*]\s+\S/.test(current)) {
          items.push(current.replace(/^[-*]\s+/, ""));
          i += 1;
          continue;
        }
        if (items.length > 0 && /^\s{2,}\S/.test(current) && current.trim()) {
          items[items.length - 1] += ` ${current.trim()}`;
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", items });
      continue;
    }
    const para = [line.trim()];
    i += 1;
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (!current.trim()) break;
      if (current.trim().startsWith("```")) break;
      if (headingDepth(current)) break;
      if (/^[-*]\s+\S/.test(current)) break;
      if (isTableRow(current) && isTableSep(lines[i + 1] ?? "")) break;
      para.push(current.trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", text: para.join(" ") });
  }
  return blocks;
}
