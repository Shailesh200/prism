import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { loadOAuthApp } from "./oauth-apps.js";
import { DRIVER_LABELS } from "./drivers.js";
import {
  DISPATCH_OAUTH_LOOPBACK_PORT,
  DISPATCH_OAUTH_REDIRECT_URI,
  type OAuthProvider,
} from "./oauth-providers.js";
import type { DriverId } from "./types.js";

export {
  buildAuthorizeUrl,
  createPkce,
  DEFAULT_AUTH_BROKER_URL,
  DISPATCH_OAUTH_LOOPBACK_PORT,
  DISPATCH_OAUTH_REDIRECT_URI,
  exchangeCode,
  OAUTH_PROVIDERS,
  type OAuthProvider,
  type TokenExchange,
} from "./oauth-providers.js";

export function clientIdFor(
  provider: OAuthProvider,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const value = env[provider.clientIdEnv]?.trim();
  return value || undefined;
}

export function clientSecretFor(
  provider: OAuthProvider,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const value = env[provider.clientSecretEnv]?.trim();
  return value || undefined;
}

export async function resolveOAuthClient(
  workspaceRoot: string,
  provider: OAuthProvider,
  env: NodeJS.ProcessEnv,
): Promise<{ clientId?: string; clientSecret?: string }> {
  const saved = await loadOAuthApp(workspaceRoot, provider.id);
  const clientId = clientIdFor(provider, env) ?? saved?.clientId;
  const clientSecret = clientSecretFor(provider, env) ?? saved?.clientSecret;
  return {
    ...(clientId ? { clientId } : {}),
    ...(clientSecret ? { clientSecret } : {}),
  };
}

export function oauthSetupGuide(provider: OAuthProvider): {
  driver: DriverId;
  label: string;
  redirectUri: string;
  needsClientCredentials: false;
  broker: string;
  message: string;
} {
  const label = DRIVER_LABELS[provider.id];
  return {
    driver: provider.id,
    label,
    redirectUri: DISPATCH_OAUTH_REDIRECT_URI,
    needsClientCredentials: false,
    broker: "https://auth.prismhq.in",
    message: [
      `${label} is not connected.`,
      `Say “connect ${label}” — Cursor shows Authenticate, Claude opens Prism Auth.`,
      "You do not create an OAuth app or paste a client id.",
    ].join(" "),
  };
}

export type LoopbackResult = {
  code: string;
  state: string;
  redirectUri: string;
};

/**
 * Bind 127.0.0.1 and wait for `/callback?code=`. Used by the host MCP process
 * so Prism Auth can return the pickup blob after the vendor grant.
 */
export async function waitForLoopbackCode(input: {
  readonly timeoutMs?: number;
  readonly html?: string;
  /** Defaults to 8765 so the local pickup URL stays stable. */
  readonly preferredPort?: number;
  /** Cancel the waiter (user declined Authenticate, tool aborted). */
  readonly signal?: AbortSignal;
}): Promise<{
  port: number;
  redirectUri: string;
  done: Promise<LoopbackResult>;
}> {
  const timeoutMs = input.timeoutMs ?? 180_000;
  const preferredPort = input.preferredPort ?? DISPATCH_OAUTH_LOOPBACK_PORT;
  const server = createServer();
  const held = { port: 0 };
  const done = new Promise<LoopbackResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      server.close();
      fn();
    };
    const onAbort = () => {
      finish(() => reject(new Error("OAuth cancelled")));
    };
    const timer = setTimeout(() => {
      finish(() =>
        reject(new Error("OAuth timed out waiting for the browser callback")),
      );
    }, timeoutMs);
    if (input.signal) {
      if (input.signal.aborted) {
        onAbort();
        return;
      }
      input.signal.addEventListener("abort", onAbort, { once: true });
    }
    server.on("request", (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") ?? "";
      const error = url.searchParams.get("error");
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        input.html ??
          "<html><body><p>Prism Dispatch is connected. You can close this tab.</p></body></html>",
      );
      if (error || !code) {
        finish(() => reject(new Error(error ?? "missing OAuth code")));
        return;
      }
      finish(() =>
        resolve({
          code,
          state,
          redirectUri: `http://127.0.0.1:${held.port}/callback`,
        }),
      );
    });
  });

  try {
    await listenLoopback(server, preferredPort);
  } catch (cause) {
    server.close();
    const code =
      cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code: unknown }).code)
        : "";
    if (code === "EADDRINUSE" && preferredPort !== 0) {
      throw new Error(
        `Prism Dispatch OAuth needs ${DISPATCH_OAUTH_REDIRECT_URI} free. Port ${preferredPort} is already in use — stop the other process (or a leftover connect) and try again.`,
        { cause },
      );
    }
    throw cause;
  }
  held.port = addressPort(server);
  return {
    port: held.port,
    redirectUri: `http://127.0.0.1:${held.port}/callback`,
    done,
  };
}

function listenLoopback(
  server: ReturnType<typeof createServer>,
  port: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (cause: Error) => reject(cause);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function addressPort(server: ReturnType<typeof createServer>): number {
  const address = server.address();
  if (address && typeof address === "object") return address.port;
  throw new Error("loopback server has no port");
}

export async function openInBrowser(url: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    await exec(command, args);
  } catch {
    /* the tool response still includes the URL */
  }
}
