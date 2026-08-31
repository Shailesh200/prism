export const IDLE_MS = 15 * 60 * 1000;

export type IdleClock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

const systemClock: IdleClock = {
  now: () => Date.now(),
  setTimeout,
  clearTimeout,
};

export function createIdleTimer(options: {
  readonly idleMs?: number;
  readonly clock?: IdleClock;
  readonly shouldExit: () => boolean;
  readonly onIdle: () => void;
}): { touch: () => void; stop: () => void } {
  const idleMs = options.idleMs ?? IDLE_MS;
  const clock = options.clock ?? systemClock;
  let handle: ReturnType<typeof setTimeout> | undefined;

  const arm = (): void => {
    if (handle) clock.clearTimeout(handle);
    handle = clock.setTimeout(() => {
      if (options.shouldExit()) options.onIdle();
      else arm();
    }, idleMs);
    if (typeof handle === "object" && "unref" in handle) {
      handle.unref();
    }
  };

  arm();
  return {
    touch: arm,
    stop: () => {
      if (handle) clock.clearTimeout(handle);
    },
  };
}
