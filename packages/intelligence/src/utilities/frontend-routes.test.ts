import { describe, expect, it } from "vitest";
import {
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
    expect(routeFromPageFilePath("pages/index.tsx")).toBe("/");
    expect(routeFromPageFilePath("pages/settings.tsx")).toBe("/settings");
  });
});
