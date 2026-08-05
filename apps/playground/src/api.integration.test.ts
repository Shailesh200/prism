import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { typicalRepository, type Fixture } from "@repo-prism/test-support";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The playground's `/api/*` routes, driven against a real repository.
 *
 * These live inside the Vite config as a dev-server plugin, so the only honest
 * way to test them is to start the server and make requests. Extracting the
 * handlers to call them directly would test a copy of the routing rather than
 * the routing.
 */

const here = dirname(fileURLToPath(import.meta.url));

let server: ViteDevServer;
let origin: string;
let fixture: Fixture;

beforeAll(async () => {
  fixture = await typicalRepository();
  server = await createServer({
    configFile: resolve(here, "../vite.config.ts"),
    root: resolve(here, ".."),
    logLevel: "error",
    server: { port: 0, host: "127.0.0.1" },
  });
  await server.listen();

  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("playground server did not bind a port");
  }
  origin = `http://127.0.0.1:${address.port}`;
}, 180_000);

afterAll(async () => {
  await server?.close();
  await fixture?.cleanup();
});

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const url = new URL(path, origin);
  url.searchParams.set("root", fixture.root);
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

async function post(
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const url = new URL(path, origin);
  url.searchParams.set("root", fixture.root);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // POST handlers take the root from the body, matching what `map-client.ts`
    // sends. The query parameter is set as well so a handler that reads either
    // one finds it.
    body: JSON.stringify({ root: fixture.root, ...(body as object) }),
  });
  return { status: res.status, body: await res.json() };
}

describe("analysis routes answer from a real index", () => {
  it("returns a health score for the fixture", async () => {
    const { status, body } = await get("/api/health");

    expect(status).toBe(200);
    expect(typeof (body as { score: number }).score).toBe("number");
  }, 120_000);

  it("analyses the repository named by the root parameter", async () => {
    const { status, body } = await get("/api/map");

    expect(status).toBe(200);
    // Without this the server would happily analyse its own checkout and the
    // rest of the suite would be asserting on the wrong repository.
    expect((body as { rootPath: string }).rootPath).toContain(
      fixture.root.split("/").pop() ?? "",
    );
    expect(
      (body as { graph: { nodes: unknown[] } }).graph.nodes.length,
    ).toBeGreaterThan(0);
  }, 120_000);

  it("returns a dependency graph", async () => {
    const { status, body } = await get("/api/graph");

    expect(status).toBe(200);
    expect((body as { nodes?: unknown[] }).nodes?.length ?? 0).toBeGreaterThan(
      0,
    );
  }, 120_000);

  it("returns JSON, not an HTML error page, for an unknown api route", async () => {
    // Vite's catch-all would otherwise serve index.html with a 200, and the
    // client would try to JSON.parse a document.
    const res = await fetch(new URL("/api/not-a-route", origin));

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("consent", () => {
  it("starts with every purpose ungranted", async () => {
    const { status, body } = await get("/api/consent");

    expect(status).toBe(200);
    const purposes = body as { granted: boolean }[];
    expect(purposes.length).toBeGreaterThan(0);
    expect(purposes.every((p) => !p.granted)).toBe(true);
  });

  it("refuses a network route until consent is recorded", async () => {
    const { body } = await post("/api/git-fetch", {});

    // Whether it arrives as an HTTP error or an in-band refusal, the user must
    // be told this needs permission rather than shown a silent no-op.
    expect(JSON.stringify(body).toLowerCase()).toContain("consent");
  });

  it("records a grant and reports it back", async () => {
    const set = await post("/api/consent", {
      purpose: "network.github",
      granted: true,
    });
    expect(set.status).toBe(200);

    const { body } = await get("/api/consent");
    const github = (
      body as { purpose: { id: string }; granted: boolean }[]
    ).find((p) => p.purpose.id === "network.github");

    expect(github?.granted).toBe(true);
  });

  it("rejects a purpose it does not know", async () => {
    const { status } = await post("/api/consent", {
      purpose: "network.whatever",
      granted: true,
    });

    // Accepting an unknown purpose would write a permission that nothing ever
    // reads, which looks to the user like a granted capability.
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe("bad input", () => {
  it("fails clearly when the root does not exist", async () => {
    const url = new URL("/api/health", origin);
    url.searchParams.set("root", "/definitely/not/a/repository");
    const res = await fetch(url);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get("content-type")).toContain("application/json");
  }, 60_000);

  it("fails clearly when a POST body is not JSON", async () => {
    const url = new URL("/api/consent", origin);
    const res = await fetch(url, { method: "POST", body: "not json" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
