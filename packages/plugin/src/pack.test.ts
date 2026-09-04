import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  claudeManifest,
  cursorManifest,
  mcpConfig,
  pluginDefinition,
} from "./definition.js";
import { parseFrontmatter, readPackDir } from "./pack.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const def = pluginDefinition("9.9.9");
const skills = readPackDir(join(root, "skills"), "skill");
const commands = readPackDir(join(root, "commands"), "command");

describe("parseFrontmatter", () => {
  it("reads the flat scalars a host needs", () => {
    const { fields, body } = parseFrontmatter(
      "---\nname: a-skill\ndescription: Does a thing. Use when asked.\n---\n\n# Body\n",
    );
    expect(fields.name).toBe("a-skill");
    expect(fields.description).toBe("Does a thing. Use when asked.");
    expect(body.trim()).toBe("# Body");
  });

  it("keeps a colon inside a description, which prose is full of", () => {
    const { fields } = parseFrontmatter(
      "---\ndescription: Use when: reviewing a PR\n---\nbody\n",
    );
    expect(fields.description).toBe("Use when: reviewing a PR");
  });

  it("treats a file with no frontmatter as all body, not as empty fields", () => {
    const { fields, body } = parseFrontmatter("# Just prose\n");
    expect(fields).toEqual({});
    expect(body).toBe("# Just prose\n");
  });
});

describe("the pack on disk", () => {
  it("ships exactly the skills the definition declares", () => {
    expect(skills.map((row) => row.id).sort()).toEqual([...def.skills].sort());
  });

  it("ships exactly the commands the definition declares", () => {
    expect(commands.map((row) => row.id).sort()).toEqual(
      [...def.commands].sort(),
    );
  });

  it("gives every skill a description a model can match a request against", () => {
    for (const skill of skills) {
      // Short enough to be a label is too short to route on: the host picks a
      // skill by matching a request against this string and nothing else.
      expect(skill.description.length).toBeGreaterThan(80);
      // It has to say when to fire, not just what it is. A description that
      // only describes never gets chosen over a general answer.
      expect(
        skill.description,
        `${skill.id} does not say when to use it`,
      ).toMatch(/\bUse (when|on|before|after|for)\b/);
    }
  });

  it("names host capabilities by role, never by a specific tool name", () => {
    // Prism cannot know whether GitHub arrives as a plugin, an MCP server or
    // the gh CLI. A skill that hardcodes one is wrong on the other two.
    for (const skill of skills) {
      expect(skill.body).not.toMatch(/mcp_[a-z]+_[a-z]+/i);
      expect(skill.body).not.toMatch(/\bgh pr create\b/);
    }
  });

  it("only references tools Prism actually ships", () => {
    // Read from the generated reference rather than a list kept here. That
    // page is emitted from the tool registry and `docs:check` fails when it is
    // stale, so it cannot quietly disagree with the server — a second
    // hand-maintained list could, and would, silently.
    const reference = readFileSync(
      join(root, "../../docs/reference/mcp-tools.md"),
      "utf8",
    );
    const shipped = new Set(
      [...reference.matchAll(/^\| \[`([a-z_]+)`\]/gm)].map((row) => row[1]),
    );
    expect(shipped.size).toBeGreaterThan(30);
    for (const entry of [...skills, ...commands]) {
      // Backticked snake_case is how these files spell a Prism tool.
      for (const [, name] of entry.body.matchAll(/`([a-z][a-z_]{4,})`/g)) {
        if (!name.includes("_")) continue;
        expect(
          shipped.has(name),
          `${entry.id} references \`${name}\`, which Prism does not ship`,
        ).toBe(true);
      }
    }
  });
});

describe("manifests", () => {
  it("gives Cursor directory strings and Claude an explicit file list", () => {
    expect(cursorManifest(def).skills).toBe("./skills/");
    expect(claudeManifest(def).commands).toEqual([
      "./commands/prism-review.md",
      "./commands/prism-check.md",
      "./commands/prism-onboard.md",
    ]);
  });

  it("carries the same identity into both hosts", () => {
    const cursor = cursorManifest(def);
    const claude = claudeManifest(def);
    for (const key of ["name", "version", "description", "license"]) {
      expect(claude[key]).toEqual(cursor[key]);
    }
  });

  it("launches the server exactly as the shipped install snippet does", () => {
    // Two spellings of one launch line is a support burden: the user hits a
    // problem and the documented fix does not match what they installed.
    const shipped = JSON.parse(
      readFileSync(join(root, "../mcp-server/mcp-install.json"), "utf8"),
    );
    expect(mcpConfig()).toEqual(shipped);
  });

  it("tracks the MCP server's version rather than inventing a second one", () => {
    const mcp = JSON.parse(
      readFileSync(join(root, "../mcp-server/package.json"), "utf8"),
    ) as { version: string };
    expect(pluginDefinition(mcp.version).version).toBe(mcp.version);
  });
});
