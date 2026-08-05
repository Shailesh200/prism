import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A disposable repository for the UI smoke to point at.
 *
 * Without it the playground defaults to this checkout, and the tests then
 * depend on developer-local state — a `.prism/consent.json` left behind by an
 * earlier session was enough to fail the "nothing is granted yet" assertion,
 * which is exactly the sort of failure that gets rerun until it passes rather
 * than read.
 *
 * Written synchronously at config load so `PRISM_PLAYGROUND_ROOT` is set
 * before Playwright starts the dev server.
 */
export function createSmokeFixture(): string {
  const root = join(tmpdir(), `prism-playground-smoke-${process.pid}`);
  mkdirSync(join(root, "src", "features"), { recursive: true });
  mkdirSync(join(root, "src", "lib"), { recursive: true });

  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      { name: "smoke-fixture", version: "1.0.0", type: "module" },
      null,
      2,
    ),
    ".gitignore": "node_modules/\n# Prism local cache\n.prism/\n",
    "src/index.ts": `import { cart } from "./features/cart.js";\nimport { format } from "./lib/format.js";\n\nexport function main(): string {\n  return format(cart());\n}\n`,
    "src/features/cart.ts": `import { format } from "../lib/format.js";\n\nexport function cart(): string {\n  return format("cart");\n}\n`,
    "src/features/checkout.ts": `import { cart } from "./cart.js";\n\nexport function checkout(): string {\n  return cart();\n}\n`,
    "src/lib/format.ts": `export function format(value: string): string {\n  return value.trim();\n}\n`,
    "src/index.test.ts": `import { main } from "./index.js";\n\nexport const smoke = (): boolean => main().length > 0;\n`,
  };

  for (const [path, contents] of Object.entries(files)) {
    writeFileSync(join(root, path), contents, "utf8");
  }

  // Real history, so the screens that read git have something to show rather
  // than rendering their "no data" states throughout.
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  };
  try {
    git("init", "-q");
    git("config", "user.email", "smoke@example.com");
    git("config", "user.name", "Smoke Test");
    git("add", ".");
    git("commit", "-q", "-m", "initial commit");
  } catch {
    // Without git the screens fall back to their no-data states, which still
    // render. Losing history is better than failing to start.
  }

  return root;
}
