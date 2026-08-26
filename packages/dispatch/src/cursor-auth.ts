import { loadCursorSdk } from "./worker.js";

export const CURSOR_LOGIN_TIMEOUT_MS = 180_000;

export type CursorAuthSource = "env" | "stored" | "login" | "missing";

export type CursorAuthInspect = {
  readonly ready: boolean;
  readonly source: CursorAuthSource;
  readonly apiKey?: string;
  readonly email?: string;
  readonly message: string;
};

export type CursorAuthPort = {
  status(): Promise<
    | { kind: "stored"; email?: string; expiresAtMs?: number }
    | { kind: "missing" }
  >;
  login(options: {
    readonly openBrowser: boolean;
    readonly onLoginUrl?: (url: string) => void;
    readonly signal?: AbortSignal;
  }): Promise<{
    apiKey: string;
    email?: string;
    expiresAtMs: number;
  }>;
};

export async function createSdkCursorAuthPort(): Promise<
  CursorAuthPort | undefined
> {
  const sdk = await loadCursorSdk();
  if (!sdk?.Cursor?.auth) return undefined;
  const { auth } = sdk.Cursor;
  return {
    async status() {
      const row = await auth.status();
      if (row.status !== "logged-in") return { kind: "missing" };
      return {
        kind: "stored",
        ...(row.email ? { email: row.email } : {}),
        ...(typeof row.apiKeyExpiresAtMs === "number"
          ? { expiresAtMs: row.apiKeyExpiresAtMs }
          : {}),
      };
    },
    async login(options) {
      const result = await auth.login({
        openBrowser: options.openBrowser,
        ...(options.onLoginUrl ? { onLoginUrl: options.onLoginUrl } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        apiKeyName: "Prism Dispatch",
      });
      return {
        apiKey: result.apiKey,
        ...(result.email ? { email: result.email } : {}),
        expiresAtMs: result.apiKeyExpiresAtMs,
      };
    },
  };
}

export function inspectCursorWorkerAuth(
  env: NodeJS.ProcessEnv,
  status:
    | { kind: "stored"; email?: string; expiresAtMs?: number }
    | { kind: "missing" }
    | undefined,
): CursorAuthInspect {
  const fromEnv = env.CURSOR_API_KEY?.trim();
  if (fromEnv) {
    return {
      ready: true,
      source: "env",
      apiKey: fromEnv,
      message: "You're set.",
    };
  }
  if (status?.kind === "stored") {
    return {
      ready: true,
      source: "stored",
      ...(status.email ? { email: status.email } : {}),
      message: status.email ? `You're set as ${status.email}.` : "You're set.",
    };
  }
  return {
    ready: false,
    source: "missing",
    message:
      "A Cursor sign-in page should open in your browser. Finish that, then we can start jobs. If you see Authenticating prism with Skip, click Skip — that card is not the sign-in.",
  };
}

export async function ensureCursorWorkerAuth(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly auth?: CursorAuthPort;
  readonly signal?: AbortSignal;
}): Promise<CursorAuthInspect> {
  let status:
    | { kind: "stored"; email?: string; expiresAtMs?: number }
    | { kind: "missing" }
    | undefined;
  if (!input.env.CURSOR_API_KEY?.trim() && input.auth) {
    status = await input.auth.status();
  }
  const inspected = inspectCursorWorkerAuth(input.env, status);
  if (inspected.ready) return inspected;
  if (!input.auth) {
    return {
      ready: false,
      source: "missing",
      message:
        "Prism could not start Cursor workers. Reload the prism MCP server, then say prism init.",
    };
  }

  const abort = new AbortController();
  const signals: AbortSignal[] = [
    abort.signal,
    AbortSignal.timeout(CURSOR_LOGIN_TIMEOUT_MS),
  ];
  if (input.signal) signals.push(input.signal);
  const signal = AbortSignal.any(signals);

  let loginUrl: string | undefined;
  try {
    const minted = await input.auth.login({
      openBrowser: true,
      signal,
      onLoginUrl: (url) => {
        loginUrl = url;
      },
    });
    const who = minted.email ? ` as ${minted.email}` : "";
    return {
      ready: true,
      source: "login",
      apiKey: minted.apiKey,
      ...(minted.email ? { email: minted.email } : {}),
      message: `You're set${who}.`,
    };
  } catch (cause) {
    abort.abort();
    const detail = cause instanceof Error ? cause.message : String(cause);
    const cancelled = signal.aborted || /aborted|cancel/i.test(detail);
    const link = loginUrl
      ? ` Open the sign-in page if no browser window appeared.`
      : "";
    return {
      ready: false,
      source: "missing",
      message: cancelled
        ? `Sign-in did not finish.${link} Say prism init again and complete the Cursor page in your browser. If you see Authenticating prism with Skip, click Skip.`
        : `Sign-in did not finish.${link} Say prism init to try again.`,
    };
  }
}
