import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { PrismSession } from "./session.js";
import {
  dispatchHostRequest,
  type HostDispatchState,
} from "./host-dispatch.js";
import type { HostRequest } from "./protocol.js";

/** Loopback-only port for the extension→browser bridge. */
export const BRIDGE_PORT = 17321;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".json": "application/json",
};

/**
 * Serves the same Prism UI + Core session the extension already has, over
 * HTTP on 127.0.0.1 so the system browser can open it (no second Vite/Core).
 */
export class BrowserBridge {
  private static instance: BrowserBridge | null = null;

  private server: Server | null = null;
  private session: PrismSession;
  private extensionRoot: string;
  private readonly state: HostDispatchState = {
    zoom: "package",
    layers: ["architecture", "dependency"],
  };

  private constructor(session: PrismSession, extensionRoot: string) {
    this.session = session;
    this.extensionRoot = extensionRoot;
  }

  static async ensure(
    session: PrismSession,
    extensionRoot: string,
  ): Promise<BrowserBridge> {
    if (BrowserBridge.instance) {
      BrowserBridge.instance.session = session;
      BrowserBridge.instance.extensionRoot = extensionRoot;
      if (!BrowserBridge.instance.server) {
        await BrowserBridge.instance.listen();
      }
      return BrowserBridge.instance;
    }
    const bridge = new BrowserBridge(session, extensionRoot);
    BrowserBridge.instance = bridge;
    await bridge.listen();
    return bridge;
  }

  static dispose(): void {
    BrowserBridge.instance?.stop();
    BrowserBridge.instance = null;
  }

  get url(): string {
    return `http://127.0.0.1:${BRIDGE_PORT}/`;
  }

  private async listen(): Promise<void> {
    if (this.server) return;

    const server = createServer((req, res) => {
      void this.handle(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          // Port already held (e.g. prior host) — open that URL anyway.
          this.server = null;
          resolve();
          return;
        }
        reject(err);
      });
      server.listen(BRIDGE_PORT, "127.0.0.1", () => {
        this.server = server;
        resolve();
      });
    });
  }

  private stop(): void {
    this.server?.close();
    this.server = null;
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", this.url);

      if (req.method === "OPTIONS") {
        this.cors(res);
        res.statusCode = 204;
        res.end();
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/host") {
        await this.handleRpc(req, res);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/healthz") {
        this.json(res, 200, {
          ok: true,
          root: this.session.root,
          open: this.session.isOpen,
        });
        return;
      }

      if (
        req.method === "GET" &&
        (url.pathname === "/" || url.pathname === "")
      ) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(this.indexHtml());
        return;
      }

      await this.serveStatic(url.pathname, res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.json(res, 500, { error: message });
    }
  }

  private async handleRpc(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      this.json(res, 400, { id: "?", ok: false, error: "Invalid JSON" });
      return;
    }
    if (!parsed || typeof parsed !== "object" || !("method" in parsed)) {
      this.json(res, 400, { id: "?", ok: false, error: "Invalid request" });
      return;
    }
    const reqBody = parsed as HostRequest;
    if (!this.session.isOpen) {
      this.json(res, 503, {
        id: reqBody.id ?? "?",
        ok: false,
        error: "Prism workspace is not open in the extension",
      });
      return;
    }
    const response = await dispatchHostRequest(
      this.session,
      reqBody,
      this.state,
    );
    this.json(res, 200, response);
  }

  private async serveStatic(
    pathname: string,
    res: ServerResponse,
  ): Promise<void> {
    const clean = pathname.replace(/\?.*$/, "").replace(/^\//, "");
    if (clean.includes("..")) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    const mapped = mapAssetPath(this.extensionRoot, clean);
    const candidates = mapped
      ? [mapped]
      : [
          join(
            this.extensionRoot,
            "dist",
            "webview",
            clean.replace(/^webview\//, ""),
          ),
          join(this.extensionRoot, "dist", clean.replace(/^dist\//, "")),
          join(this.extensionRoot, "media", clean.replace(/^media\//, "")),
        ];

    for (const file of candidates) {
      try {
        const data = await readFile(file);
        const type = MIME[extname(file)] ?? "application/octet-stream";
        res.statusCode = 200;
        res.setHeader("Content-Type", type);
        res.end(data);
        return;
      } catch {
        // try next
      }
    }
    res.statusCode = 404;
    res.end("Not found");
  }

  private indexHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="/tokens.css" />
  <link rel="stylesheet" href="/map.css" />
  <link rel="stylesheet" href="/webview/app.css" />
  <link rel="stylesheet" href="/webview.css" />
  <title>Prism</title>
</head>
<body class="prism-theme" data-prism-mode="browser" data-brand="/media/prism-mark.png">
  <div id="root"></div>
  <script type="module" src="/webview/app.js"></script>
</body>
</html>`;
  }

  private cors(res: ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    this.cors(res);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  }
}

function mapAssetPath(extensionRoot: string, clean: string): string | null {
  if (clean === "tokens.css") return join(extensionRoot, "dist", "tokens.css");
  if (clean === "map.css") return join(extensionRoot, "dist", "map.css");
  if (clean === "webview.css")
    return join(extensionRoot, "dist", "webview.css");
  if (clean.startsWith("webview/")) {
    return join(
      extensionRoot,
      "dist",
      "webview",
      clean.slice("webview/".length),
    );
  }
  if (clean.startsWith("media/")) {
    return join(extensionRoot, "media", clean.slice("media/".length));
  }
  return null;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
