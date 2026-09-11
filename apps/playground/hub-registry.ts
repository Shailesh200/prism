import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  DEFAULT_DISPATCH_URL,
  type PrismSurfacesStatus,
} from "@repo-prism/shared";

export type HubWorkspace = {
  readonly path: string;
  readonly label?: string;
  readonly lastSeenAt?: string;
};

export type HubRegistry = {
  readonly workspaces?: readonly HubWorkspace[];
  readonly selectedPath?: string;
};

export type PlaygroundPreset = {
  readonly id: string;
  readonly label: string;
  readonly root: string;
};

export function hubHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PRISM_HUB_HOME?.trim();
  if (override) return override;
  return join(homedir(), ".prism", "hub");
}

export function loadHubRegistrySync(
  env: NodeJS.ProcessEnv = process.env,
): HubRegistry {
  try {
    const raw = readFileSync(join(hubHome(env), "registry.json"), "utf8");
    return JSON.parse(raw) as HubRegistry;
  } catch {
    return {};
  }
}

function labelFor(path: string, fallback?: string): string {
  return fallback?.trim() || basename(path.replace(/[/\\]+$/, "")) || path;
}

/**
 * Spectrum indexes the Dispatch-selected repo. Never fall back to the Prism
 * checkout just because Vite is running from this monorepo.
 */
export function defaultPlaygroundRoot(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const registry = loadHubRegistrySync(env);
  const selected = registry.selectedPath?.trim();
  if (selected) return resolve(selected);
  const first = registry.workspaces?.[0]?.path?.trim();
  if (first) return resolve(first);
  const fromEnv = env.PRISM_PLAYGROUND_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return undefined;
}

export function playgroundPresets(env: NodeJS.ProcessEnv = process.env): {
  readonly defaultRoot: string;
  readonly presets: PlaygroundPreset[];
} {
  const registry = loadHubRegistrySync(env);
  const presets: PlaygroundPreset[] = [];
  const seen = new Set<string>();
  for (const row of registry.workspaces ?? []) {
    const root = row.path?.trim();
    if (!root) continue;
    const resolved = resolve(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    presets.push({
      id: resolved,
      label: labelFor(resolved, row.label),
      root: resolved,
    });
  }
  const fallback = defaultPlaygroundRoot(env);
  if (fallback && !seen.has(fallback)) {
    presets.unshift({
      id: fallback,
      label: labelFor(fallback),
      root: fallback,
    });
  }
  return { defaultRoot: fallback ?? "", presets };
}

export function saveSelectedRoot(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const root = path.trim() ? resolve(path.trim()) : "";
  if (!root) return undefined;
  const file = join(hubHome(env), "registry.json");
  const current = loadHubRegistrySync(env);
  const workspaces = [...(current.workspaces ?? [])];
  if (!workspaces.some((row) => resolve(row.path) === root)) {
    workspaces.push({
      path: root,
      label: labelFor(root),
      lastSeenAt: new Date().toISOString(),
    });
  }
  mkdirSync(hubHome(env), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify(
      { ...current, workspaces, selectedPath: root },
      null,
      2,
    )}\n`,
  );
  return root;
}

export function spectrumOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.PRISM_PLAYGROUND_PORT?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 17331;
  const port = Number.isInteger(parsed) && parsed > 0 ? parsed : 17331;
  return `http://prismhq.localhost:${port}/`;
}

/**
 * Whether Dispatch is answering on this machine. Spectrum is this process.
 */
export async function playgroundSurfaces(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: (
    input: string,
    init?: { signal?: AbortSignal },
  ) => Promise<Response> = fetch,
): Promise<PrismSurfacesStatus> {
  const spectrum = { live: true as const, url: spectrumOrigin(env) };
  try {
    const raw = readFileSync(join(hubHome(env), "hub.json"), "utf8");
    const rec = JSON.parse(raw) as { port?: number; token?: string };
    if (typeof rec.port !== "number") {
      return {
        dispatch: { live: false, url: DEFAULT_DISPATCH_URL },
        spectrum,
      };
    }
    const token = typeof rec.token === "string" ? rec.token : "";
    const url = token
      ? `http://prismhq.localhost:${rec.port}/?token=${encodeURIComponent(token)}`
      : `http://prismhq.localhost:${rec.port}/`;
    let live = false;
    try {
      const response = await fetchImpl(
        `http://127.0.0.1:${rec.port}/api/healthz`,
        { signal: AbortSignal.timeout(800) },
      );
      if (response.ok) {
        const body = (await response.json()) as {
          ok?: boolean;
          asleep?: boolean;
        };
        live = body.ok === true && body.asleep !== true;
      }
    } catch {
      live = false;
    }
    return { dispatch: { live, url }, spectrum };
  } catch {
    return {
      dispatch: { live: false, url: DEFAULT_DISPATCH_URL },
      spectrum: { live: true, url: spectrumOrigin(env) },
    };
  }
}
