import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BackendReportSchema } from "@repo-prism/shared";
import {
  buildBackendReport,
  extractGraphqlSchema,
  extractProtoServices,
  extractTrpc,
} from "./report.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
);

describe("extractTrpc (M-061 P-E3)", () => {
  it("extracts nested and top-level procedures", () => {
    const text = `
      export const appRouter = router({
        user: router({
          getById: publicProcedure.query(async () => ({})),
          create: publicProcedure.mutation(async () => ({})),
        }),
        health: publicProcedure.query(async () => ({ ok: true })),
      });
    `;
    const routes = extractTrpc("router.ts", text);
    const paths = routes.map((r) => `${r.method} ${r.path}`).sort();
    expect(paths).toEqual(
      expect.arrayContaining([
        "QUERY /user.getById",
        "MUTATION /user.create",
        "QUERY /health",
      ]),
    );
    expect(routes.every((r) => r.framework === "trpc")).toBe(true);
  });
});

describe("extractGraphqlSchema (M-061 P-E3)", () => {
  it("reads Query/Mutation fields", () => {
    const text = `
      type Query { user(id: ID!): User }
      type Mutation { createUser(name: String!): User! }
    `;
    const routes = extractGraphqlSchema("schema.graphql", text);
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      "MUTATION /createUser",
      "QUERY /user",
    ]);
  });
});

describe("extractProtoServices (M-061 P-E3)", () => {
  it("reads service rpc methods", () => {
    const text = `
      service UserService {
        rpc GetUser (GetUserRequest) returns (User);
      }
    `;
    const routes = extractProtoServices("user.proto", text);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.framework).toBe("grpc");
    expect(routes[0]?.path).toBe("/UserService/GetUser");
    expect(routes[0]?.method).toBe("RPC");
  });
});

describe("buildBackendReport fixtures (M-061 P-E3)", () => {
  it("mount-point tracking prefixes child router paths", () => {
    const report = buildBackendReport({
      workspaceRoot: join(fixtures, "m061-backend-mount"),
    });
    expect(BackendReportSchema.safeParse(report).success).toBe(true);
    const paths = report.endpoints.map((e) => `${e.method} ${e.path}`);
    expect(paths).toEqual(
      expect.arrayContaining([
        "GET /api/users",
        "POST /api/users",
        "GET /health",
      ]),
    );
    expect(report.frameworksDetected).toContain("express");
  });

  it("extracts tRPC procedures from fixture", () => {
    const report = buildBackendReport({
      workspaceRoot: join(fixtures, "m061-backend-trpc"),
    });
    expect(BackendReportSchema.safeParse(report).success).toBe(true);
    expect(report.frameworksDetected).toContain("trpc");
    expect(
      report.endpoints.some(
        (e) => e.framework === "trpc" && e.path.includes("user.getById"),
      ),
    ).toBe(true);
  });

  it("extracts GraphQL schema operations from fixture", () => {
    const report = buildBackendReport({
      workspaceRoot: join(fixtures, "m061-backend-graphql"),
    });
    expect(BackendReportSchema.safeParse(report).success).toBe(true);
    expect(report.frameworksDetected).toContain("graphql");
    expect(
      report.endpoints.some(
        (e) => e.framework === "graphql" && e.path === "/createUser",
      ),
    ).toBe(true);
  });

  it("wires .proto services/RPCs into BackendReport", () => {
    const report = buildBackendReport({
      workspaceRoot: join(fixtures, "m061-backend-proto"),
    });
    expect(BackendReportSchema.safeParse(report).success).toBe(true);
    expect(report.frameworksDetected).toContain("grpc");
    expect(
      report.endpoints.some(
        (e) => e.framework === "grpc" && e.path === "/UserService/GetUser",
      ),
    ).toBe(true);
    expect(
      report.endpoints.some((e) => e.overlayNodeId?.startsWith("api:proto:")),
    ).toBe(true);
  });
});
