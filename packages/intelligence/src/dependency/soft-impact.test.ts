import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildSoftImpactIndex,
  matchGlob,
  parseDockerCopySources,
} from "./soft-impact.js";

const FIXTURE = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../fixtures/m049-soft",
);

function listFiles(root: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, prefix || "."))) {
    if (name === "node_modules" || name === ".git") continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) out.push(...listFiles(root, rel));
    else out.push(rel.replace(/\\/g, "/"));
  }
  return out.sort();
}

describe("matchGlob", () => {
  it("matches vitest-style include patterns", () => {
    expect(matchGlob("src/**/*.test.ts", "src/a.test.ts")).toBe(true);
    expect(matchGlob("src/**/*.test.ts", "src/nested/b.test.ts")).toBe(true);
    expect(matchGlob("src/**/*.test.ts", "src/a.ts")).toBe(false);
  });
});

describe("parseDockerCopySources", () => {
  it("extracts COPY sources and skips --from", () => {
    expect(parseDockerCopySources("COPY package.json ./")).toEqual([
      "package.json",
    ]);
    expect(parseDockerCopySources("COPY src ./src")).toEqual(["src"]);
    expect(
      parseDockerCopySources("COPY --chown=node:node scripts/build.js ./x"),
    ).toEqual(["scripts/build.js"]);
    expect(
      parseDockerCopySources("COPY --from=builder /app/dist ./dist"),
    ).toEqual([]);
  });
});

describe("buildSoftImpactIndex", () => {
  it("emits soft edges from vitest.config include globs", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromConfig = index.edges.filter((e) => e.from === "vitest.config.ts");
    expect(fromConfig.map((e) => e.to)).toContain("src/index.test.ts");
    expect(fromConfig.every((e) => e.confidence === "medium")).toBe(true);
  });

  it("parses package.json scripts paths, entries, and workspaces", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromPkg = index.edges.filter((e) => e.from === "package.json");

    // entry targets
    const entries = fromPkg.filter((e) => e.reason.includes("entry target"));
    expect(entries.map((e) => e.to).sort()).toEqual(
      expect.arrayContaining(["src/index.ts", "src/util.ts", "scripts/cli.js"]),
    );
    expect(entries.every((e) => e.confidence === "high")).toBe(true);

    // script path refs
    const scriptPaths = fromPkg.filter(
      (e) =>
        e.lane === "script" &&
        e.reason.includes("references path") &&
        !e.reason.includes("pattern"),
    );
    expect(scriptPaths.map((e) => e.to)).toEqual(
      expect.arrayContaining(["scripts/build.js", "tsconfig.json"]),
    );

    // workspace members
    const members = fromPkg.filter((e) =>
      e.reason.includes("workspace member"),
    );
    expect(members.map((e) => e.to).sort()).toEqual(
      expect.arrayContaining([
        "packages/foo/package.json",
        "apps/web/package.json",
      ]),
    );

    // workspace name deps (foo → web)
    const depEdge = index.edges.find(
      (e) =>
        e.from === "packages/foo/package.json" &&
        e.to === "apps/web/package.json" &&
        e.lane === "workspace",
    );
    expect(depEdge?.confidence).toBe("high");
  });

  it("parses Dockerfile COPY structured edges", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromDocker = index.edges.filter((e) => e.from === "Dockerfile");
    const copyEdges = fromDocker.filter((e) => e.reason.includes("COPY/ADD"));
    expect(copyEdges.map((e) => e.to)).toEqual(
      expect.arrayContaining([
        "package.json",
        "scripts/build.js",
        "packages/foo/package.json",
        "src/index.ts",
      ]),
    );
    expect(
      copyEdges.some(
        (e) => e.to === "scripts/build.js" && e.confidence === "high",
      ),
    ).toBe(true);
    // --from= should not invent dist edges as high COPY sources
    expect(copyEdges.every((e) => !e.evidence[0]?.includes("--from="))).toBe(
      true,
    );
  });

  it("parses GitHub workflow paths and azure-pipelines", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromGh = index.edges.filter(
      (e) => e.from === ".github/workflows/ci.yml",
    );
    expect(
      fromGh.some(
        (e) =>
          e.reason.includes("paths") &&
          e.to.startsWith("src/") &&
          e.confidence === "medium",
      ),
    ).toBe(true);
    expect(fromGh.some((e) => e.reason.includes("working-directory"))).toBe(
      true,
    );

    const fromAzure = index.edges.filter(
      (e) => e.from === "azure-pipelines.yml",
    );
    expect(fromAzure.length).toBeGreaterThan(0);
    expect(
      fromAzure.some(
        (e) =>
          e.to.startsWith("apps/web") || e.reason.includes("working-directory"),
      ),
    ).toBe(true);
  });

  it("parses eslint files/ignores globs", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromEslint = index.edges.filter((e) => e.from === "eslint.config.js");
    expect(fromEslint.map((e) => e.to)).toEqual(
      expect.arrayContaining(["src/index.ts", "packages/foo/src/bar.ts"]),
    );
    expect(fromEslint.every((e) => e.confidence === "medium")).toBe(true);
  });

  it("parses vite entry/root", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromVite = index.edges.filter((e) => e.from === "vite.config.ts");
    expect(fromVite.map((e) => e.to)).toContain("src/index.ts");
    expect(fromVite.every((e) => e.lane === "config")).toBe(true);
  });

  it("links .env keys to process.env / import.meta.env readers", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromEnv = index.edges.filter(
      (e) => e.from === ".env" && e.lane === "env",
    );
    expect(fromEnv.map((e) => e.to)).toContain("src/config.ts");
    expect(
      fromEnv.some(
        (e) =>
          e.reason.includes("API_URL") ||
          e.evidence.some((x) => x.includes("API_URL")),
      ),
    ).toBe(true);

    // reverse nice-to-have
    const reverse = index.edges.filter(
      (e) => e.from === "src/config.ts" && e.to === ".env",
    );
    expect(reverse.length).toBeGreaterThan(0);
    expect(reverse[0]?.confidence).toBe("low");
  });

  it("parses turbo inputs path patterns", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromTurbo = index.edges.filter((e) => e.from === "turbo.json");
    expect(
      fromTurbo.some(
        (e) =>
          e.reason.includes("inputs/outputs") &&
          e.to.startsWith("src/") &&
          e.confidence === "medium",
      ),
    ).toBe(true);
  });

  it("parses Prettier overrides.files dialect", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromPrettier = index.edges.filter(
      (e) => e.from === ".prettierrc.json",
    );
    expect(fromPrettier.length).toBeGreaterThan(0);
    expect(fromPrettier.some((e) => e.to.endsWith(".ts"))).toBe(true);
    expect(fromPrettier.every((e) => e.lane === "config")).toBe(true);
  });

  it("parses Mocha and Cypress configs", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromMocha = index.edges.filter((e) => e.from === ".mocharc.json");
    expect(fromMocha.map((e) => e.to)).toEqual(
      expect.arrayContaining(["src/index.test.ts", "src/util.ts"]),
    );

    const fromCypress = index.edges.filter(
      (e) => e.from === "cypress.config.ts",
    );
    expect(fromCypress.map((e) => e.to)).toContain("cypress/e2e/smoke.cy.ts");
  });

  it("parses Nx project.json inputs/outputs", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromNx = index.edges.filter(
      (e) => e.from === "packages/foo/project.json",
    );
    expect(fromNx.length).toBeGreaterThan(0);
    expect(
      fromNx.some(
        (e) =>
          e.to === "packages/foo/src/bar.ts" ||
          e.to.startsWith("packages/foo/src/"),
      ),
    ).toBe(true);
  });

  it("parses Jenkinsfile path mentions", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromJenkins = index.edges.filter((e) => e.from === "Jenkinsfile");
    expect(fromJenkins.map((e) => e.to)).toEqual(
      expect.arrayContaining(["scripts/build.js"]),
    );
    expect(fromJenkins.every((e) => e.lane === "ci")).toBe(true);
  });

  it("emits lockfile advisory for package.json without exploding", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const lockEdges = index.edges.filter(
      (e) =>
        e.from === "package.json" &&
        e.evidence.some((x) => x === "lockfile-advisory"),
    );
    expect(lockEdges).toHaveLength(1);
    expect(lockEdges[0]?.to).toBe("package-lock.json");
    expect(lockEdges[0]?.confidence).toBe("low");
    expect(index.coverageNote ?? "").toMatch(/Lockfile advisory/i);
  });

  it("improves Azure pipelines path filters", () => {
    const root = FIXTURE;
    const index = buildSoftImpactIndex({
      workspaceRoot: root,
      filePaths: listFiles(root),
    });
    const fromAzure = index.edges.filter(
      (e) => e.from === "azure-pipelines.yml",
    );
    expect(
      fromAzure.some(
        (e) =>
          e.reason.includes("Azure pipelines path filter") &&
          (e.to.startsWith("src/") || e.to.startsWith("packages/foo/")),
      ),
    ).toBe(true);
  });

  it("fixture files exist for smoke", () => {
    expect(readFileSync(join(FIXTURE, "Dockerfile"), "utf8")).toContain("COPY");
  });
});
