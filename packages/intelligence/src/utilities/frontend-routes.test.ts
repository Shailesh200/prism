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
    expect(routeFromPageFilePath("src/app/@modal/(.)photo/[id]/page.tsx")).toBe(
      "/[id]",
    );
    expect(routeFromPageFilePath("app/dashboard/settings/page.tsx")).toBe(
      "/dashboard/settings",
    );
    expect(routeFromPageFilePath("pages/index.tsx")).toBe("/");
    expect(routeFromPageFilePath("pages/settings.tsx")).toBe("/settings");
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
    expect(routes).toContain("/blog/[slug]");
  });
});
