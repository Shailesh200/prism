import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BackendReportSchema } from "@repo-prism/shared";
import {
  buildBackendReport,
  extractExpressLike,
  extractNest,
} from "./report.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "m044-backend",
);

describe("extractNest", () => {
  it("extracts controller prefix + methods", () => {
    const text = `
      @Controller("health")
      export class HealthController {
        @Get() ok() {}
        @Post("ready") @UseGuards() ready() {}
      }
    `;
    const routes = extractNest("nest/health.controller.ts", text);
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      "GET /health",
      "POST /health/ready",
    ]);
    expect(routes.find((r) => r.method === "POST")?.auth).toBe("authenticated");
    expect(routes.find((r) => r.method === "GET")?.handlerName).toBe("ok");
    expect(routes.find((r) => r.method === "POST")?.handlerName).toBe("ready");
  });
});

describe("extractExpressLike", () => {
  it("extracts express app.get/post", () => {
    const text = `
      const app = express();
      app.get("/api/ping", handler);
      app.post("/api/orders", requireAuth, handler);
    `;
    const routes = extractExpressLike("express/app.ts", text, "express");
    expect(routes).toHaveLength(2);
    expect(routes[0]?.path).toBe("/api/ping");
    expect(routes[0]?.handlerName).toBe("handler");
    expect(routes.find((r) => r.path === "/api/orders")?.auth).toBe(
      "authenticated",
    );
  });

  it("extracts fastify get + route()", () => {
    const text = `
      const app = Fastify();
      app.get("/v1/status", async () => ({}));
      app.route({ method: "POST", url: "/v1/items", handler: async () => ({}) });
    `;
    const routes = extractExpressLike("fastify/server.ts", text, "fastify");
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      "GET /v1/status",
      "POST /v1/items",
    ]);
  });
});

describe("buildBackendReport", () => {
  it("builds a full report from the m044 fixture", () => {
    const report = buildBackendReport({ workspaceRoot: fixture });
    expect(BackendReportSchema.safeParse(report).success).toBe(true);
    expect(report.endpoints.length).toBeGreaterThanOrEqual(5);
    expect(report.frameworksDetected).toEqual(
      expect.arrayContaining(["express", "nest", "fastify"]),
    );
    expect(report.envVars.some((e) => e.name === "DATABASE_URL")).toBe(true);
    expect(report.dataLayer.length).toBeGreaterThan(0);
    expect(report.background.some((b) => b.kind === "cron")).toBe(true);
    expect(report.integrations.some((i) => i.name === "Stripe")).toBe(true);
    expect(report.endpoints.some((e) => e.handlerName !== undefined)).toBe(
      true,
    );
  });
});
