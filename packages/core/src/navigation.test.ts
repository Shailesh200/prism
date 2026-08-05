import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LandmarkSchema,
  NavigationRouteResultSchema,
} from "@repo-prism/shared";
import { Prism } from "./prism.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

describe("workspace navigation (M-016)", () => {
  it("finds a dependency route on the features fixture", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);

    const route = ws.findRoute({
      from: { kind: "file", path: "src/routes/checkout/page.ts" },
      to: { kind: "file", path: "packages/billing/src/index.ts" },
    });
    expect(route.ok).toBe(true);
    if (!route.ok) return;
    expect(NavigationRouteResultSchema.safeParse(route.value).success).toBe(
      true,
    );
    expect(route.value.empty).toBe(false);
    expect(route.value.routes[0]?.hops[0]).toBe(
      "file:src/routes/checkout/page.ts",
    );
    expect(route.value.routes[0]?.hops.at(-1)).toBe(
      "file:packages/billing/src/index.ts",
    );
  });

  it("handles empty routes and lists landmarks", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    await ws.index();

    const missing = ws.findRoute({
      from: { kind: "file", path: "src/routes/checkout/page.ts" },
      to: { kind: "file", path: "does-not-exist.ts" },
    });
    expect(missing.ok).toBe(true);
    if (!missing.ok) return;
    // Node may still be absent from graph → empty
    expect(missing.value.routes.length === 0 || missing.value.empty).toBe(true);

    const landmarks = ws.listLandmarks();
    expect(landmarks.ok).toBe(true);
    if (!landmarks.ok) return;
    expect(landmarks.value.length).toBeGreaterThan(0);
    expect(
      landmarks.value.every((l) => LandmarkSchema.safeParse(l).success),
    ).toBe(true);

    const features = ws.listFeatures();
    expect(features.ok).toBe(true);
    if (!features.ok || features.value.length < 2) return;
    const [a, b] = features.value;
    const nav = ws.navigateFeature(a!.id, b!.id);
    expect(nav.ok).toBe(true);
    if (!nav.ok) return;
    expect(NavigationRouteResultSchema.safeParse(nav.value).success).toBe(true);
  });
});
