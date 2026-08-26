import { homedir } from "node:os";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { secretsPath } from "./paths.js";
import type { DriverId } from "./types.js";

export type TokenBundle = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  extra?: Record<string, string>;
};

type SecretsFile = { tokens: Partial<Record<DriverId, TokenBundle>> };

async function keychainGet(
  service: string,
  account: string,
): Promise<string | undefined> {
  if (process.platform !== "darwin") return undefined;
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  try {
    const result = await exec(
      "security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { timeout: 8_000 },
    );
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function keychainSet(
  service: string,
  account: string,
  secret: string,
): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  try {
    await exec("security", [
      "add-generic-password",
      "-U",
      "-s",
      service,
      "-a",
      account,
      "-w",
      secret,
    ]);
    return true;
  } catch {
    return false;
  }
}

async function keychainDelete(service: string, account: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  try {
    await exec("security", [
      "delete-generic-password",
      "-s",
      service,
      "-a",
      account,
    ]);
  } catch {
    /* ignore */
  }
}

function serviceName(): string {
  return "prism.dispatch";
}

function fallbackSecretsPath(): string {
  return join(homedir(), ".prism", "dispatch-secrets.json");
}

export async function loadToken(
  workspaceRoot: string,
  driver: DriverId,
): Promise<TokenBundle | undefined> {
  const fromKeychain = await keychainGet(serviceName(), driver);
  if (fromKeychain) {
    try {
      return JSON.parse(fromKeychain) as TokenBundle;
    } catch {
      return { accessToken: fromKeychain };
    }
  }
  const file = await readJsonFile<SecretsFile>(secretsPath(workspaceRoot), {
    tokens: {},
  });
  if (file.tokens[driver]) return file.tokens[driver];
  const home = await readJsonFile<SecretsFile>(fallbackSecretsPath(), {
    tokens: {},
  });
  return home.tokens[driver];
}

export async function saveToken(
  workspaceRoot: string,
  driver: DriverId,
  bundle: TokenBundle,
): Promise<void> {
  const stored = await keychainSet(
    serviceName(),
    driver,
    JSON.stringify(bundle),
  );
  if (stored) return;
  const file = await readJsonFile<SecretsFile>(secretsPath(workspaceRoot), {
    tokens: {},
  });
  file.tokens[driver] = bundle;
  await writeJsonFile(secretsPath(workspaceRoot), file, 0o600);
}

export async function deleteToken(
  workspaceRoot: string,
  driver: DriverId,
): Promise<void> {
  await keychainDelete(serviceName(), driver);
  const file = await readJsonFile<SecretsFile>(secretsPath(workspaceRoot), {
    tokens: {},
  });
  delete file.tokens[driver];
  await writeJsonFile(secretsPath(workspaceRoot), file, 0o600);
}
