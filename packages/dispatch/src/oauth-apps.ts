import { readJsonFile, writeJsonFile } from "./json-file.js";
import { oauthAppsPath } from "./paths.js";
import type { DriverId } from "./types.js";

export type OAuthAppCredentials = {
  clientId: string;
  clientSecret?: string;
};

type AppsFile = { apps: Partial<Record<DriverId, OAuthAppCredentials>> };

export async function loadOAuthApp(
  workspaceRoot: string,
  driver: DriverId,
): Promise<OAuthAppCredentials | undefined> {
  const file = await readJsonFile<AppsFile>(oauthAppsPath(workspaceRoot), {
    apps: {},
  });
  const saved = file.apps[driver];
  if (!saved?.clientId?.trim()) return undefined;
  return {
    clientId: saved.clientId.trim(),
    ...(saved.clientSecret?.trim()
      ? { clientSecret: saved.clientSecret.trim() }
      : {}),
  };
}

export async function saveOAuthApp(
  workspaceRoot: string,
  driver: DriverId,
  patch: OAuthAppCredentials,
): Promise<OAuthAppCredentials> {
  const clientId = patch.clientId.trim();
  if (!clientId) {
    throw new Error("OAuth client id is empty");
  }
  const file = await readJsonFile<AppsFile>(oauthAppsPath(workspaceRoot), {
    apps: {},
  });
  const previous = file.apps[driver];
  const clientSecret =
    patch.clientSecret?.trim() || previous?.clientSecret?.trim() || undefined;
  const next: OAuthAppCredentials = {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
  };
  file.apps[driver] = next;
  await writeJsonFile(oauthAppsPath(workspaceRoot), file, 0o600);
  return next;
}
