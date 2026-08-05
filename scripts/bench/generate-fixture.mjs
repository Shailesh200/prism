/**
 * Generate a synthetic repository at a chosen scale (M-035 Phase 1.1).
 *
 * Benchmarks need repositories larger than this one, and committing a 50,000
 * file fixture would be absurd. So the fixture is generated from a seed, which
 * also makes it *identical* on every machine — a benchmark comparing two
 * machines against different repositories measures nothing.
 *
 *   bun run scripts/bench/generate-fixture.mjs small     ~1,000 files
 *   bun run scripts/bench/generate-fixture.mjs medium   ~10,000 files
 *   bun run scripts/bench/generate-fixture.mjs large    ~50,000 files
 *
 * Shape is copied from this repository, measured 2026-08-05 over 466 TypeScript
 * files: file length p10/p50/p90/p99 of 5/70/444/1732 lines, imports per file
 * p50 1 and p90 6, and roughly 27 files per package. A fixture whose shape is
 * unrepresentative produces budgets that pass while real repositories regress.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const SCALES = {
  small: { files: 1_000, seed: 1 },
  medium: { files: 10_000, seed: 2 },
  large: { files: 50_000, seed: 3 },
};

export function fixturePath(scale) {
  return join(repoRoot, ".bench", "fixtures", scale);
}

/**
 * xorshift32. Not a good PRNG, but it is deterministic, dependency-free and
 * identical across runtimes, which is the whole requirement here.
 */
function makeRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_00_00_00_00;
  };
}

/**
 * Sample a file length from the measured quantiles by interpolating between
 * them. Crude, but it reproduces the property that matters: most files are
 * small and a few are very large, so parse cost is not uniform per file.
 */
function sampleLines(random) {
  const p = random();
  if (p < 0.1) return 3 + Math.floor(random() * 8);
  if (p < 0.5) return 10 + Math.floor(random() * 60);
  if (p < 0.9) return 70 + Math.floor(random() * 380);
  if (p < 0.99) return 450 + Math.floor(random() * 1_300);
  return 1_700 + Math.floor(random() * 2_000);
}

function sampleImportCount(random) {
  const p = random();
  if (p < 0.15) return 0;
  if (p < 0.5) return 1;
  if (p < 0.9) return 2 + Math.floor(random() * 4);
  return 6 + Math.floor(random() * 8);
}

/** Package count grows sub-linearly, as it does in real monorepos. */
function packageCount(files) {
  return Math.max(4, Math.round(Math.sqrt(files) * 0.8));
}

function moduleSource(name, imports, lines, random) {
  const parts = [
    `/** Generated fixture module ${name}. */`,
    ...imports.map(
      (target, i) => `import { value${i} as dep${i} } from "${target}";`,
    ),
    "",
  ];

  // A type and an interface per file: symbol extraction should see something
  // other than functions, or the fixture would flatter the analyzer.
  parts.push(
    `export type ${name}Options = { readonly id: string; readonly count: number };`,
    `export interface ${name}Result { readonly ok: boolean; readonly items: readonly string[]; }`,
    "",
    `export const value${name.length % 16} = ${JSON.stringify(name)};`,
    "",
  );

  let emitted = parts.length;
  let index = 0;
  while (emitted < lines) {
    const uses = imports
      .map((_, i) => `dep${i}`)
      .slice(0, 1 + Math.floor(random() * Math.max(1, imports.length)))
      .join(" + ");

    parts.push(
      `export function ${name}Fn${index}(options: ${name}Options): ${name}Result {`,
      `  const items: string[] = [];`,
      `  for (let i = 0; i < options.count; i += 1) {`,
      `    items.push(\`\${options.id}-\${i}\`${uses ? ` + String(${uses})` : ""});`,
      `  }`,
      `  return { ok: items.length > 0, items };`,
      `}`,
      "",
    );
    emitted += 8;
    index += 1;
  }

  return `${parts.join("\n")}\n`;
}

export async function generate(scale, { quiet = false } = {}) {
  const config = SCALES[scale];
  if (!config) {
    throw new Error(
      `unknown scale "${scale}" — expected one of ${Object.keys(SCALES).join(", ")}`,
    );
  }

  const root = fixturePath(scale);
  const random = makeRandom(config.seed);
  const packages = packageCount(config.files);
  const perPackage = Math.ceil(config.files / packages);

  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: `prism-bench-${scale}`,
        private: true,
        version: "0.0.0",
        type: "module",
        workspaces: ["packages/*"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeFile(
    join(root, "tsconfig.json"),
    `${JSON.stringify(
      { compilerOptions: { module: "esnext", target: "esnext", strict: true } },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // Modules are named before any are written so imports can point at real
  // files. Import targets are always drawn from *earlier* modules, which keeps
  // the graph acyclic — cycles are then added deliberately below rather than
  // appearing at a rate nobody chose.
  const modules = [];
  for (let p = 0; p < packages; p += 1) {
    for (let f = 0; f < perPackage && modules.length < config.files; f += 1) {
      modules.push({ pkg: p, index: f, name: `Mod${p}x${f}` });
    }
  }

  let written = 0;
  for (let p = 0; p < packages; p += 1) {
    const pkgDir = join(root, "packages", `pkg-${p}`);
    await mkdir(join(pkgDir, "src"), { recursive: true });

    await writeFile(
      join(pkgDir, "package.json"),
      `${JSON.stringify(
        {
          name: `@bench/pkg-${p}`,
          version: "0.0.0",
          type: "module",
          main: "./src/index.ts",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const own = modules.filter((module) => module.pkg === p);

    for (const module of own) {
      const wanted = sampleImportCount(random);
      const imports = [];

      for (let i = 0; i < wanted; i += 1) {
        // Four out of five imports stay inside the package, matching how real
        // code clusters. The rest cross a package boundary, which is what
        // makes package-level aggregation non-trivial.
        const crossPackage = random() < 0.2;
        const pool = crossPackage
          ? modules.filter((m) => m.pkg < p)
          : own.filter((m) => m.index < module.index);
        if (pool.length === 0) continue;

        const target = pool[Math.floor(random() * pool.length)];
        imports.push(
          target.pkg === p
            ? `./${target.name}.js`
            : `../../pkg-${target.pkg}/src/${target.name}.js`,
        );
      }

      await writeFile(
        join(pkgDir, "src", `${module.name}.ts`),
        moduleSource(module.name, imports, sampleLines(random), random),
        "utf8",
      );

      // Roughly one file in six gets a test beside it, so test-presence and
      // test-impact have something real to find.
      if (random() < 0.17) {
        await writeFile(
          join(pkgDir, "src", `${module.name}.test.ts`),
          [
            `import { describe, expect, it } from "vitest";`,
            `import { ${module.name}Fn0 } from "./${module.name}.js";`,
            "",
            `describe("${module.name}", () => {`,
            `  it("builds items", () => {`,
            `    expect(${module.name}Fn0({ id: "a", count: 2 }).ok).toBe(true);`,
            `  });`,
            `});`,
            "",
          ].join("\n"),
          "utf8",
        );
      }

      written += 1;
    }

    await writeFile(
      join(pkgDir, "src", "index.ts"),
      `${own.map((m) => `export * from "./${m.name}.js";`).join("\n")}\n`,
      "utf8",
    );
  }

  // A handful of deliberate cycles. A repository with none is not the one
  // anybody is trying to make faster, and cycle detection is on the hot path.
  const cycles = Math.max(2, Math.round(packages / 8));
  for (let c = 0; c < cycles; c += 1) {
    const p = Math.floor(random() * packages);
    const own = modules.filter((m) => m.pkg === p);
    if (own.length < 2) continue;
    const [first, second] = own;
    await writeFile(
      join(root, "packages", `pkg-${p}`, "src", `${first.name}.ts`),
      `import { value${second.name.length % 16} as back } from "./${second.name}.js";\n` +
        `export const cycleMark = String(back);\n` +
        moduleSource(first.name, [`./${second.name}.js`], 40, random),
      "utf8",
    );
  }

  if (!quiet) {
    console.log(
      `generate-fixture: ${scale} — ${written} modules across ${packages} packages at ${root}`,
    );
  }

  return { root, modules: written, packages };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const scale = process.argv[2];
  if (!scale) {
    console.error(
      `usage: generate-fixture.mjs <${Object.keys(SCALES).join("|")}>`,
    );
    process.exitCode = 1;
  } else {
    await generate(scale);
  }
}
