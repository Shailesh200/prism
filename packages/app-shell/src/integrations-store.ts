/**
 * Local-only Integrations connection persistence (M-046 / ADR-0024).
 * Secrets (tokens / API keys) stay in localStorage — never forwarded to Core logs.
 * Network master gate lives in `prism.settings.v1` (`allowNetworkIntegrations`).
 */

export const INTEGRATIONS_STORAGE_KEY = "prism.integrations.v1";

/**
 * Whether Lighthouse / PageSpeed metrics should surface in the Frontend domain.
 * Persisted separately from connection state so the Domain screen can read it
 * without depending on the full integrations map.
 */
export const LIGHTHOUSE_FRONTEND_STORAGE_KEY =
  "prism.integrations.lighthouseFrontend.v1";

/** Extra GitHub repos whose DevOps signals are staged under `.prism/remote-ci`. */
export const REMOTE_REPOS_STORAGE_KEY = "prism.integrations.remoteRepos.v1";

export type IntegrationConnection = {
  enabled: boolean;
  config?: Record<string, string>;
};

export type IntegrationsState = Record<string, IntegrationConnection>;

/** A foreign GitHub repo added from Domain · DevOps “Add Workflow”. */
export type RemoteDevopsRepo = {
  readonly owner: string;
  readonly repo: string;
  /** Optional PAT scoped to this remote (falls back to primary GitHub token). */
  readonly token?: string;
};

export function loadIntegrationsState(): IntegrationsState {
  try {
    const raw = localStorage.getItem(INTEGRATIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: IntegrationsState = {};
    for (const [id, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      const enabled = row.enabled === true;
      const configRaw = row.config;
      let config: Record<string, string> | undefined;
      if (
        configRaw &&
        typeof configRaw === "object" &&
        !Array.isArray(configRaw)
      ) {
        config = {};
        for (const [k, v] of Object.entries(
          configRaw as Record<string, unknown>,
        )) {
          if (typeof v === "string") config[k] = v;
        }
      }
      out[id] = config ? { enabled, config } : { enabled };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveIntegrationsState(state: IntegrationsState): void {
  try {
    localStorage.setItem(INTEGRATIONS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * True when Remote Git is enabled — opt-in for remote history fetch (`git fetch`)
 * only. DevOps remains available from local overlays regardless of this flag.
 */
export function isGitIntegrationEnabled(
  state: IntegrationsState = loadIntegrationsState(),
): boolean {
  return state.git?.enabled === true;
}

function parseRemoteRepos(raw: unknown): RemoteDevopsRepo[] {
  if (!Array.isArray(raw)) return [];
  const out: RemoteDevopsRepo[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const owner = typeof r.owner === "string" ? r.owner.trim() : "";
    const repo = typeof r.repo === "string" ? r.repo.trim() : "";
    if (!owner || !repo) continue;
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const token =
      typeof r.token === "string" && r.token.trim() !== ""
        ? r.token.trim()
        : undefined;
    out.push(token ? { owner, repo, token } : { owner, repo });
  }
  return out;
}

/** Load persisted remote DevOps repos (Other Repo CI). */
export function loadRemoteRepos(): RemoteDevopsRepo[] {
  try {
    const raw = localStorage.getItem(REMOTE_REPOS_STORAGE_KEY);
    if (!raw) {
      // Legacy: optional array under integrations state key as `remoteRepos`.
      const legacy = localStorage.getItem(INTEGRATIONS_STORAGE_KEY);
      if (!legacy) return [];
      const parsed: unknown = JSON.parse(legacy);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        "remoteRepos" in (parsed as object)
      ) {
        return parseRemoteRepos(
          (parsed as { remoteRepos?: unknown }).remoteRepos,
        );
      }
      return [];
    }
    return parseRemoteRepos(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Persist remote DevOps repos. */
export function saveRemoteRepos(repos: readonly RemoteDevopsRepo[]): void {
  try {
    localStorage.setItem(REMOTE_REPOS_STORAGE_KEY, JSON.stringify(repos));
  } catch {
    /* ignore */
  }
}

/** Add or replace a remote DevOps repo entry (keyed by owner/repo). */
export function upsertRemoteRepo(entry: RemoteDevopsRepo): RemoteDevopsRepo[] {
  const next = loadRemoteRepos().filter(
    (r) =>
      !(
        r.owner.toLowerCase() === entry.owner.toLowerCase() &&
        r.repo.toLowerCase() === entry.repo.toLowerCase()
      ),
  );
  next.push(entry);
  saveRemoteRepos(next);
  return next;
}

/** Remove a remote DevOps repo entry. */
export function removeRemoteRepo(
  owner: string,
  repo: string,
): RemoteDevopsRepo[] {
  const next = loadRemoteRepos().filter(
    (r) =>
      !(
        r.owner.toLowerCase() === owner.toLowerCase() &&
        r.repo.toLowerCase() === repo.toLowerCase()
      ),
  );
  saveRemoteRepos(next);
  return next;
}

/**
 * Wipe Integrations connection state, Lighthouse Frontend opt-in, and remote
 * DevOps repos.
 */
export function clearIntegrationsState(): void {
  try {
    localStorage.removeItem(INTEGRATIONS_STORAGE_KEY);
    localStorage.removeItem(LIGHTHOUSE_FRONTEND_STORAGE_KEY);
    localStorage.removeItem(REMOTE_REPOS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Read the persisted "enable Lighthouse / CWV in the Frontend domain" flag.
 * Defaults to `false` when unset or when storage is unavailable.
 */
export function loadLighthouseEnabledInFrontend(): boolean {
  try {
    return localStorage.getItem(LIGHTHOUSE_FRONTEND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist the "enable Lighthouse / CWV in the Frontend domain" flag. */
export function saveLighthouseEnabledInFrontend(enabled: boolean): void {
  try {
    localStorage.setItem(
      LIGHTHOUSE_FRONTEND_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    /* ignore */
  }
}

/**
 * Getter the Domain · Frontend screen can read later to decide whether to show
 * Lighthouse / Core Web Vitals panels. Alias of {@link loadLighthouseEnabledInFrontend}.
 */
export function isLighthouseEnabledInFrontend(): boolean {
  return loadLighthouseEnabledInFrontend();
}
