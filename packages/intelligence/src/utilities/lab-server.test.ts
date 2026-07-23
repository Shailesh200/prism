import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMON_LAB_PORTS,
  detectLabKind,
  discoverLabUrl,
  resolveLabAppRoot,
} from "./lab-server.js";

describe("lab-server", () => {
  it("detects next / vite from package.json and config files", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-lab-kind-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "demo",
        dependencies: { next: "15.0.0" },
      }),
    );
    expect(detectLabKind(root)).toBe("next");

    const viteRoot = await mkdtemp(join(tmpdir(), "prism-lab-vite-"));
    await writeFile(
      join(viteRoot, "package.json"),
      JSON.stringify({ name: "vite-app", devDependencies: { vite: "6.0.0" } }),
    );
    await writeFile(join(viteRoot, "vite.config.ts"), "export default {}");
    expect(detectLabKind(viteRoot)).toBe("vite");
  });

  it("prefers apps/web when it looks like a frontend package", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-lab-mono-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "mono", private: true }),
    );
    await mkdir(join(root, "apps", "web"), { recursive: true });
    await writeFile(
      join(root, "apps", "web", "package.json"),
      JSON.stringify({
        name: "web",
        dependencies: { next: "15.0.0" },
      }),
    );
    expect(resolveLabAppRoot(root)).toBe(join(root, "apps", "web"));
  });

  it("lists common local ports including 3000", () => {
    expect(COMMON_LAB_PORTS).toContain(3000);
    expect(COMMON_LAB_PORTS).toContain(4173);
  });

  it("discoverLabUrl prefers an explicit reachable URL", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      server.close();
      throw new Error("expected TCP address");
    }
    const url = `http://127.0.0.1:${addr.port}/`;
    try {
      const result = await discoverLabUrl({ url, port: 59_991 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.url).toBe(url);
      expect(result.port).toBe(addr.port);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
