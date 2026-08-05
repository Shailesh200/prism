import { createFixture, type Fixture } from "./fixture.js";

/**
 * Named repository shapes, so that a test says what kind of repository it needs
 * rather than open-coding two hundred lines of `writeFile`.
 *
 * Each shape exists to make a specific behaviour observable. If a new test needs
 * a shape none of these provide, add one here with a comment saying what it is
 * for — a fixture whose purpose is not written down gets quietly reshaped by the
 * next person and breaks the tests that depended on the old shape.
 */

/**
 * A small but complete TypeScript application: a feature layer, an API that
 * depends on it, tests beside the code, an import cycle, and an orphan with no
 * importers. Enough for dependency, impact, health and coverage answers to be
 * non-trivial, small enough to index in well under a second.
 */
export async function typicalRepository(): Promise<Fixture> {
  const fixture = await createFixture({ name: "typical" });

  await fixture.write(
    "package.json",
    `${JSON.stringify(
      {
        name: "typical-fixture",
        version: "1.0.0",
        private: true,
        scripts: { test: "vitest run", build: "tsc -p ." },
        dependencies: { express: "4.18.0" },
        devDependencies: { typescript: "5.4.0", vitest: "1.0.0" },
      },
      null,
      2,
    )}\n`,
  );

  await fixture.write(
    "tsconfig.json",
    `${JSON.stringify({ compilerOptions: { strict: true } }, null, 2)}\n`,
  );

  await fixture.write(
    "src/features/cart.ts",
    [
      "import { formatPrice } from '../lib/format.js';",
      "",
      "export type Item = { price: number; qty: number };",
      "",
      "export function total(items: Item[]): number {",
      "  return items.reduce((sum, i) => sum + i.price * i.qty, 0);",
      "}",
      "",
      "export function describe(items: Item[]): string {",
      "  return formatPrice(total(items));",
      "}",
      "",
    ].join("\n"),
  );

  await fixture.write(
    "src/features/cart.test.ts",
    [
      "import { describe as summarise, total } from './cart.js';",
      "",
      "it('sums an empty cart', () => {",
      "  expect(total([])).toBe(0);",
      "});",
      "",
      "it('describes a cart', () => {",
      "  expect(summarise([])).toContain('0');",
      "});",
      "",
    ].join("\n"),
  );

  await fixture.write(
    "src/features/checkout.ts",
    [
      "import { total, type Item } from './cart.js';",
      "",
      "export function checkout(items: Item[]): { paid: number } {",
      "  return { paid: total(items) };",
      "}",
      "",
    ].join("\n"),
  );

  await fixture.write(
    "src/lib/format.ts",
    [
      "export function formatPrice(value: number): string {",
      "  return `$${value.toFixed(2)}`;",
      "}",
      "",
    ].join("\n"),
  );

  await fixture.write(
    "src/api/server.ts",
    [
      "import express from 'express';",
      "import { checkout } from '../features/checkout.js';",
      "",
      "export const app = express();",
      "",
      "app.post('/api/checkout', (req, res) => {",
      "  res.json(checkout(req.body.items ?? []));",
      "});",
      "",
    ].join("\n"),
  );

  // A deliberate two-file cycle, so `getCycles` has something to find. Without
  // one, a test asserting "no cycles" passes even if cycle detection is broken.
  await fixture.write(
    "src/cycle/left.ts",
    [
      "import { right } from './right.js';",
      "export const left = () => right();",
      "",
    ].join("\n"),
  );
  await fixture.write(
    "src/cycle/right.ts",
    [
      "import { left } from './left.js';",
      "export const right = () => left;",
      "",
    ].join("\n"),
  );

  // Imported by nothing: safe-delete and blast radius should both notice.
  await fixture.write(
    "src/lib/orphan.ts",
    [
      "export function unused(): string {",
      "  return 'nobody calls me';",
      "}",
      "",
    ].join("\n"),
  );

  await fixture.write("README.md", "# Typical fixture\n");

  fixture.commit("initial commit", { date: "2026-01-02T09:00:00+00:00" });

  // A second commit by a second author, so ownership is a distribution rather
  // than a single name, and so history has more than one point in it.
  await fixture.write(
    "src/lib/format.ts",
    [
      "export function formatPrice(value: number): string {",
      "  return `$${value.toFixed(2)}`;",
      "}",
      "",
      "export function formatQty(value: number): string {",
      "  return `${value} items`;",
      "}",
      "",
    ].join("\n"),
  );
  fixture.commit("add quantity formatting", {
    author: "Second Author",
    email: "second@example.invalid",
    date: "2026-02-03T09:00:00+00:00",
  });

  return fixture;
}

/**
 * The same shape with no git repository at all. Its job is to prove that every
 * git-derived signal degrades to an explicit "no data" rather than to a
 * plausible-looking zero (ADR-0029).
 */
export async function repositoryWithoutGit(): Promise<Fixture> {
  const fixture = await createFixture({ name: "nogit", git: false });

  await fixture.write(
    "package.json",
    `${JSON.stringify({ name: "nogit-fixture", version: "1.0.0", private: true }, null, 2)}\n`,
  );
  await fixture.write(
    "src/index.ts",
    [
      "import { helper } from './helper.js';",
      "export const main = () => helper();",
      "",
    ].join("\n"),
  );
  await fixture.write(
    "src/helper.ts",
    ["export function helper(): number {", "  return 42;", "}", ""].join("\n"),
  );

  return fixture;
}

/**
 * A repository with nothing analysable in it: no package manifest, no source.
 * The empty case is where "no data" and "broken" are easiest to confuse, so it
 * is worth having a fixture that produces it deliberately.
 */
export async function emptyRepository(): Promise<Fixture> {
  const fixture = await createFixture({ name: "empty" });
  await fixture.write("README.md", "# Nothing here\n");
  fixture.commit("initial commit");
  return fixture;
}
