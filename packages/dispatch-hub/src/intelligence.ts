import type {
  HostDispatchState,
  HostRequest,
  HostResponse,
  PrismSession,
} from "@repo-prism/host-session";

/**
 * How long an idle Core session survives before it is closed.
 *
 * An indexed session holds the whole repository graph in memory. The Console
 * is an always-on user-level daemon, so anything it keeps, it keeps for days
 * (ADR-0048). Ten minutes is long enough that switching tabs or reading a
 * report does not re-index, and short enough that a laptop left open
 * overnight is not holding a repository it has forgotten about.
 */
export const SESSION_IDLE_MS = 10 * 60 * 1000;

export type IntelligenceDeps = {
  /**
   * Loads `@repo-prism/core` and its host-session wrapper. Injected so tests
   * can drive the plane without an indexer, and — more importantly — so the
   * import is a value passed at call time rather than a static edge the
   * bundler would pull into the always-on path.
   */
  readonly load?: () => Promise<IntelligenceModule>;
  readonly idleMs?: number;
  readonly now?: () => number;
};

export type IntelligenceModule = {
  createSession(): PrismSession;
  dispatch(
    session: PrismSession,
    request: HostRequest,
    state: HostDispatchState,
  ): Promise<HostResponse>;
};

export type IntelligencePlane = {
  /** Answer one RPC, opening or reusing a session for `workspacePath`. */
  handle(workspacePath: string, request: HostRequest): Promise<HostResponse>;
  /** Which workspace is currently held open, if any. */
  openWorkspace(): string | undefined;
  /** True once Core has actually been loaded — what `/api/healthz` reports. */
  loaded(): boolean;
  close(): void;
};

/**
 * The default loader: a genuine dynamic `import()`.
 *
 * ADR-0043 kept Core out of the hub so the always-on daemon would stay small.
 * ADR-0048 restates that as *no Core until asked* — this function is the
 * "until asked". A user who only ever looks at jobs never runs it.
 */
async function loadCore(): Promise<IntelligenceModule> {
  const mod = await import("@repo-prism/host-session");
  return {
    createSession: () => new mod.PrismSession(),
    dispatch: (session, request, state) =>
      mod.dispatchHostRequest(session, request, state),
  };
}

export function createIntelligencePlane(
  deps: IntelligenceDeps = {},
): IntelligencePlane {
  const load = deps.load ?? loadCore;
  const idleMs = deps.idleMs ?? SESSION_IDLE_MS;
  const now = deps.now ?? (() => Date.now());

  let mod: IntelligenceModule | undefined;
  let session: PrismSession | undefined;
  let openPath: string | undefined;
  let lastUsed = 0;
  let sweep: ReturnType<typeof setInterval> | undefined;
  // One in-flight open per workspace. Two tabs asking at once must not start
  // two indexes of the same repository.
  let opening: Promise<HostResponse | undefined> | undefined;

  // Every request shares one zoom/layer state, matching the extension's
  // single-panel behaviour. Two browser tabs on the same repo will fight over
  // it; that is a known limit of a single session, not a silent bug.
  const state: HostDispatchState = {
    zoom: "package",
    layers: ["architecture", "dependency"],
  };

  const evict = (): void => {
    session?.close();
    session = undefined;
    openPath = undefined;
  };

  const ensureSweep = (): void => {
    if (sweep) return;
    sweep = setInterval(
      () => {
        if (session && now() - lastUsed > idleMs) evict();
      },
      Math.max(1000, Math.floor(idleMs / 4)),
    );
    sweep.unref?.();
  };

  async function ensureSession(
    workspacePath: string,
    id: string,
  ): Promise<HostResponse | undefined> {
    if (session && openPath === workspacePath) return undefined;
    mod ??= await load();
    // Only one workspace at a time. Caching several indexed repositories in a
    // background process is how a local-first tool ends up blamed for a slow
    // laptop, so opening a second closes the first.
    evict();
    const next = mod.createSession();
    const opened = await next.open(workspacePath);
    if (!opened.ok) {
      next.close();
      return { id, ok: false, error: opened.error.message };
    }
    session = next;
    openPath = workspacePath;
    ensureSweep();
    return undefined;
  }

  return {
    async handle(workspacePath, request) {
      lastUsed = now();
      // Serialise opens so concurrent first requests share one index build.
      opening = (opening ?? Promise.resolve(undefined)).then(() =>
        ensureSession(workspacePath, request.id),
      );
      const failure = await opening;
      opening = undefined;
      if (failure) return failure;
      if (!session || !mod) {
        return { id: request.id, ok: false, error: "No workspace open" };
      }
      lastUsed = now();
      return await mod.dispatch(session, request, state);
    },
    openWorkspace: () => openPath,
    loaded: () => mod !== undefined,
    close: () => {
      if (sweep) clearInterval(sweep);
      sweep = undefined;
      evict();
    },
  };
}
