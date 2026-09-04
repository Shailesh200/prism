/**
 * Reading the pack off disk, and checking it is well-formed (ADR-0050).
 *
 * Hosts discover a skill by its frontmatter: no `name` and it cannot be
 * addressed, no `description` and the model has nothing to match a request
 * against. Both failures are silent — the pack installs, the skill simply never
 * fires — so they are worth catching at build time rather than in a bug report.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type PackEntry = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly body: string;
};

/**
 * The subset of YAML frontmatter a plugin manifest needs.
 *
 * Deliberately not a YAML parser. The fields hosts require are flat scalars,
 * and a dependency that can parse anchors and nested maps would let a skill
 * carry frontmatter this build validates but a host cannot read.
 */
export function parseFrontmatter(source: string): {
  readonly fields: Record<string, string>;
  readonly body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) return { fields: {}, body: source };
  const fields: Record<string, string> = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const value = (pair[2] ?? "").trim();
    fields[pair[1] ?? ""] = value.replace(/^["'](.*)["']$/, "$1");
  }
  return { fields, body: match[2] ?? "" };
}

/**
 * Read every skill or command in a directory.
 *
 * Skills are `<id>/SKILL.md`; commands are `<id>.md`. Throws on the first
 * malformed entry rather than emitting a pack with a skill that cannot fire.
 */
export function readPackDir(
  dir: string,
  kind: "skill" | "command",
): readonly PackEntry[] {
  const entries: PackEntry[] = [];
  for (const child of readdirSync(dir).sort()) {
    let id: string;
    let file: string;
    if (kind === "skill") {
      if (!statSync(join(dir, child)).isDirectory()) continue;
      id = child;
      file = join(dir, child, "SKILL.md");
    } else {
      if (!child.endsWith(".md")) continue;
      id = child.slice(0, -3);
      file = join(dir, child);
    }

    const { fields, body } = parseFrontmatter(readFileSync(file, "utf8"));
    const description = fields.description ?? "";
    if (!description) {
      throw new Error(`${file}: frontmatter needs a description`);
    }
    // Commands are addressed by filename, so only skills carry a `name` — and
    // it has to equal the directory, because that is what the host resolves.
    const name = fields.name ?? id;
    if (kind === "skill" && name !== id) {
      throw new Error(
        `${file}: frontmatter name "${name}" does not match directory "${id}"`,
      );
    }
    if (!body.trim()) throw new Error(`${file}: has frontmatter but no body`);
    entries.push({ id, name, description, body });
  }
  return entries;
}
