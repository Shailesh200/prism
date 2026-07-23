import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecurityReportSchema, type SecurityCheck } from "@prism/shared";
import { buildSecurityReport } from "./report.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tempRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
}

function check(
  report: { checks: SecurityCheck[] },
  id: string,
): SecurityCheck | undefined {
  return report.checks.find((c) => c.id === id);
}

describe("buildSecurityReport (M-046)", () => {
  it("detects Dependabot + CodeQL and passes general checks", () => {
    const root = tempRoot("prism-sec-rpt-");
    write(root, "package.json", JSON.stringify({ name: "demo" }));
    write(root, "bun.lock", "{}\n");
    write(root, ".gitignore", "node_modules\n.env\n.env.*\n");
    write(root, ".github/dependabot.yml", "version: 2\nupdates: []\n");
    write(
      root,
      ".github/workflows/codeql.yml",
      "name: CodeQL\non: push\njobs:\n  analyze:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: github/codeql-action/analyze@v3\n",
    );
    write(root, ".env.example", "API_KEY=\n");

    const report = buildSecurityReport({ workspaceRoot: root });
    expect(SecurityReportSchema.safeParse(report).success).toBe(true);
    expect(report.tools.find((t) => t.id === "dependabot")?.present).toBe(true);
    expect(report.tools.find((t) => t.id === "codeql")?.present).toBe(true);
    expect(check(report, "env-gitignored")?.status).toBe("pass");
    expect(check(report, "lockfile-present")?.status).toBe("pass");
    expect(check(report, "dependency-updates")?.status).toBe("pass");
    expect(check(report, "sast-tool")?.status).toBe("pass");
    expect(report.score).toBeGreaterThan(40);
    expect(report.summary).toMatch(/pass/);
  });

  it("fails env-gitignored when .env is committed and warns without tools", () => {
    const root = tempRoot("prism-sec-env-");
    write(root, "package.json", JSON.stringify({ name: "demo" }));
    write(root, ".env", "SECRET=1\n");

    const report = buildSecurityReport({ workspaceRoot: root });
    expect(check(report, "env-gitignored")?.status).toBe("fail");
    expect(check(report, "sast-tool")?.status).toBe("warn");
    expect(check(report, "secrets-scan-tool")?.status).toBe("warn");
    expect(check(report, "dependency-updates")?.status).toBe("warn");
    expect(report.tools.every((t) => !t.present)).toBe(true);
  });

  it("warns env-gitignored when nothing committed but no .gitignore rule", () => {
    const root = tempRoot("prism-sec-noignore-");
    write(root, "package.json", JSON.stringify({ name: "demo" }));
    write(root, "bun.lock", "{}\n");

    const report = buildSecurityReport({ workspaceRoot: root });
    expect(check(report, "env-gitignored")?.status).toBe("warn");
  });

  it("detects secret + SAST tools (gitleaks / semgrep)", () => {
    const root = tempRoot("prism-sec-tools-");
    write(root, "package.json", JSON.stringify({ name: "demo" }));
    write(root, ".gitleaks.toml", "[allowlist]\n");
    write(root, ".semgrep.yml", "rules: []\n");
    write(root, "renovate.json", '{ "extends": ["config:base"] }\n');

    const report = buildSecurityReport({ workspaceRoot: root });
    expect(report.tools.find((t) => t.id === "gitleaks")?.present).toBe(true);
    expect(report.tools.find((t) => t.id === "renovate")?.present).toBe(true);
    expect(check(report, "secrets-scan-tool")?.status).toBe("pass");
    expect(check(report, "sast-tool")?.status).toBe("pass");
    expect(check(report, "dependency-updates")?.status).toBe("pass");
  });

  it("segregates backend checks by domain and detects libraries", () => {
    const root = tempRoot("prism-sec-be-");
    write(
      root,
      "package.json",
      JSON.stringify({
        name: "api",
        dependencies: {
          express: "4.18.0",
          passport: "0.7.0",
          zod: "3.23.0",
          cors: "2.8.5",
          helmet: "7.1.0",
        },
      }),
    );
    write(root, "bun.lock", "{}\n");
    write(root, ".gitignore", ".env\n");
    write(
      root,
      "src/server/app.ts",
      `import express from "express";\nimport helmet from "helmet";\nconst app = express();\napp.use(helmet());\n`,
    );

    const report = buildSecurityReport({
      workspaceRoot: root,
      hasBackendDomain: true,
    });

    const auth = check(report, "auth-library");
    expect(auth?.status).toBe("pass");
    expect(auth?.domain).toBe("backend");

    expect(check(report, "input-validation")?.status).toBe("pass");
    expect(check(report, "input-validation")?.domain).toBe("backend");
    expect(check(report, "cors-config")?.status).toBe("pass");
    expect(check(report, "https-only")?.status).toBe("pass");
    expect(check(report, "security-headers")?.status).toBe("pass");
    expect(check(report, "security-headers")?.domain).toBe("backend");
  });

  it("warns https-only when hardcoded http:// endpoints exist in backend", () => {
    const root = tempRoot("prism-sec-http-");
    write(root, "package.json", JSON.stringify({ name: "api" }));
    write(root, "bun.lock", "{}\n");
    write(
      root,
      "src/api/client.ts",
      `export const BASE = "http://api.example.com/v1";\n`,
    );

    const report = buildSecurityReport({
      workspaceRoot: root,
      hasBackendDomain: true,
    });
    expect(check(report, "https-only")?.status).toBe("warn");
    expect(check(report, "auth-library")?.status).toBe("warn");
  });

  it("skips backend checks when no backend domain is detected", () => {
    const root = tempRoot("prism-sec-nobe-");
    write(root, "package.json", JSON.stringify({ name: "lib" }));
    write(root, "bun.lock", "{}\n");
    write(root, "src/index.ts", "export const x = 1;\n");

    const report = buildSecurityReport({
      workspaceRoot: root,
      hasFrontendDomain: false,
    });
    expect(check(report, "auth-library")?.status).toBe("skip");
    expect(check(report, "https-only")?.status).toBe("skip");
    expect(check(report, "dangerous-html")?.status).toBe("skip");
  });

  it("flags dangerous-html sinks in the frontend domain", () => {
    const root = tempRoot("prism-sec-fe-");
    write(
      root,
      "package.json",
      JSON.stringify({ name: "web", dependencies: { react: "18.3.0" } }),
    );
    write(root, "bun.lock", "{}\n");
    write(
      root,
      "src/App.tsx",
      `export const App = () => <div dangerouslySetInnerHTML={{ __html: raw }} />;\n`,
    );

    const report = buildSecurityReport({ workspaceRoot: root });
    const danger = check(report, "dangerous-html");
    expect(danger?.status).toBe("warn");
    expect(danger?.domain).toBe("frontend");
  });
});
