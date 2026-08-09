import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverFrontendAppRoutes,
  extractFrontendRoutesFromSource,
  normalizeFrontendRoute,
  routeFromPageFilePath,
} from "./frontend-routes.js";

describe("frontend-routes", () => {
  it("normalizes paths", () => {
    expect(normalizeFrontendRoute("login")).toBe("/login");
    expect(normalizeFrontendRoute("/privacy/")).toBe("/privacy");
    expect(normalizeFrontendRoute("/")).toBe("/");
  });

  it("extracts react-router and seo paths", () => {
    const source = `
      path: '/',
      path: '/privacy',
      <Route index element={<Home />} />
      <Route path="login" element={<Login />} />
      <Route path="insights/spending" element={<Spend />} />
      <Route path="cards/:userCardId" element={<Detail />} />
      <Route path="*" element={<NotFound />} />
    `;
    const routes = extractFrontendRoutesFromSource(source);
    expect(routes).toContain("/");
    expect(routes).toContain("/privacy");
    expect(routes).toContain("/login");
    expect(routes).toContain("/insights/spending");
    expect(routes).toContain("/cards/:userCardId");
    expect(routes).not.toContain("/*");
  });

  it("maps next page files to routes", () => {
    expect(routeFromPageFilePath("apps/web/src/app/page.tsx")).toBe("/");
    expect(
      routeFromPageFilePath("apps/web/src/app/(marketing)/about/page.tsx"),
    ).toBe("/about");
    expect(routeFromPageFilePath("app/dashboard/settings/page.tsx")).toBe(
      "/dashboard/settings",
    );
    expect(routeFromPageFilePath("pages/index.tsx")).toBe("/");
    expect(routeFromPageFilePath("pages/settings.tsx")).toBe("/settings");
  });

  it("drops dynamic segments — folder names are not measurable URLs", () => {
    expect(routeFromPageFilePath("src/app/@modal/(.)photo/[id]/page.tsx")).toBe(
      null,
    );
    expect(routeFromPageFilePath("app/blog/[slug]/page.tsx")).toBe(null);
    expect(routeFromPageFilePath("app/docs/[[...slug]]/page.tsx")).toBe(null);
    expect(routeFromPageFilePath("app/blog/[...slug]/page.tsx")).toBe(null);
    expect(routeFromPageFilePath("pages/posts/[id].tsx")).toBe(null);
  });

  it("discovers Next App Router pages under src/app in a nested package", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-routes-"));
    const appDir = join(root, "apps", "web", "src", "app");
    mkdirSync(join(appDir, "about"), { recursive: true });
    mkdirSync(join(appDir, "(marketing)", "pricing"), { recursive: true });
    mkdirSync(join(appDir, "blog", "[slug]"), { recursive: true });
    writeFileSync(
      join(appDir, "page.tsx"),
      "export default function Home() {}",
    );
    writeFileSync(
      join(appDir, "about", "page.tsx"),
      "export default function About() {}",
    );
    writeFileSync(
      join(appDir, "(marketing)", "pricing", "page.tsx"),
      "export default function Pricing() {}",
    );
    writeFileSync(
      join(appDir, "blog", "[slug]", "page.tsx"),
      "export default function Post() {}",
    );

    const routes = discoverFrontendAppRoutes(root);
    expect(routes).toContain("/");
    expect(routes).toContain("/about");
    expect(routes).toContain("/pricing");
    // Dynamic folder names are not measurable URLs.
    expect(routes).not.toContain("/blog/[slug]");
  });

  it("scopes discovery to the measured app root in a monorepo", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-routes-scope-"));
    // Website app (Next) — sibling that must NOT leak into the lab's routes.
    const siteApp = join(root, "apps", "website", "app");
    mkdirSync(join(siteApp, "security"), { recursive: true });
    writeFileSync(join(siteApp, "page.tsx"), "export default function H() {}");
    writeFileSync(
      join(siteApp, "security", "page.tsx"),
      "export default function S() {}",
    );
    // Playground app (Vite + React Router) — the app being measured.
    const pgRoot = join(root, "apps", "playground");
    mkdirSync(join(pgRoot, "src"), { recursive: true });
    writeFileSync(
      join(pgRoot, "src", "app.tsx"),
      `export const routes = <><Route path="/" element={<M />} /><Route path="/map" element={<P />} /></>;`,
    );

    const scoped = discoverFrontendAppRoutes(root, pgRoot);
    expect(scoped).toContain("/map");
    expect(scoped).not.toContain("/security");

    const wide = discoverFrontendAppRoutes(root);
    expect(wide).toContain("/security");
  });
});
