import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMON_LAB_PORTS,
  detectLabKind,
  discoverLabUrl,
  resolveLabAppRoot,
  resolveLabPreviewStart,
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

  it("starts next via package script without host/port extras", () => {
    const runner = {
      run: (script: string, extra: readonly string[] = []) => ({
        cmd: "pnpm",
        args:
          extra.length > 0 ? ["run", script, "--", ...extra] : ["run", script],
      }),
      exec: (bin: string, args: readonly string[]) => ({
        cmd: "pnpm",
        args: ["exec", bin, ...args],
      }),
    };
    const start = resolveLabPreviewStart(
      "next",
      { start: "node scripts/ensure-db.mjs && next start" },
      4173,
      runner,
    );
    expect(start).toEqual({ cmd: "pnpm", args: ["run", "start"] });
    expect(JSON.stringify(start)).not.toContain("-H");
    expect(JSON.stringify(start)).not.toMatch(/"--"/);
  });

  it("falls back to next exec with long flags when no start script", () => {
    const runner = {
      run: (script: string, extra: readonly string[] = []) => ({
        cmd: "pnpm",
        args:
          extra.length > 0 ? ["run", script, "--", ...extra] : ["run", script],
      }),
      exec: (bin: string, args: readonly string[]) => ({
        cmd: "pnpm",
        args: ["exec", bin, ...args],
      }),
    };
    const start = resolveLabPreviewStart("next", {}, 4173, runner);
    expect(start).toEqual({
      cmd: "pnpm",
      args: [
        "exec",
        "next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "4173",
      ],
    });
  });

  it("starts vite preview with explicit 127.0.0.1 host/port", () => {
    const runner = {
      run: (script: string, extra: readonly string[] = []) => ({
        cmd: "bun",
        args:
          extra.length > 0 ? ["run", script, "--", ...extra] : ["run", script],
      }),
      exec: (bin: string, args: readonly string[]) => ({
        cmd: "bunx",
        args: [bin, ...args],
      }),
    };
    const start = resolveLabPreviewStart(
      "vite",
      { preview: "vite preview" },
      4173,
      runner,
    );
    expect(start).toEqual({
      cmd: "bun",
      args: [
        "run",
        "preview",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        "4173",
        "--strictPort",
      ],
    });
  });

  it("uses vite exec when preview script is compound", () => {
    const runner = {
      run: (script: string, extra: readonly string[] = []) => ({
        cmd: "bun",
        args:
          extra.length > 0 ? ["run", script, "--", ...extra] : ["run", script],
      }),
      exec: (bin: string, args: readonly string[]) => ({
        cmd: "bunx",
        args: [bin, ...args],
      }),
    };
    const start = resolveLabPreviewStart(
      "vite",
      { preview: "npm run build && vite preview" },
      4173,
      runner,
    );
    expect(start).toEqual({
      cmd: "bunx",
      args: [
        "vite",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        "4173",
        "--strictPort",
      ],
    });
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

  it("lists common local ports including 3000 (not macOS AirPlay :5000)", () => {
    expect(COMMON_LAB_PORTS).toContain(3000);
    expect(COMMON_LAB_PORTS).toContain(4173);
    expect(COMMON_LAB_PORTS).not.toContain(5000);
  });

  it("prefers apps/playground when present in a Prism-like monorepo", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-lab-pg-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "mono", private: true }),
    );
    await mkdir(join(root, "apps", "playground"), { recursive: true });
    await writeFile(
      join(root, "apps", "playground", "package.json"),
      JSON.stringify({
        name: "playground",
        devDependencies: { vite: "6.0.0" },
      }),
    );
    await writeFile(
      join(root, "apps", "playground", "vite.config.ts"),
      "export default {}",
    );
    expect(resolveLabAppRoot(root)).toBe(join(root, "apps", "playground"));
  });

  it("discoverLabUrl rejects AirTunes-style 403 listeners", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.writeHead(403, { Server: "AirTunes/950.7.1", "Content-Length": "0" });
      res.end();
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
      const result = await discoverLabUrl({ url, port: addr.port });
      expect(result.ok).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
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
