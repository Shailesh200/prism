import { ProductWindow } from "@/components/product-window";

type DispatchTheaterProps = {
  /** Magazine plate omits the landing caption; chrome is the same Pulse. */
  variant?: "landing" | "magazine";
};

/**
 * Animated Dispatch Console — current Pulse chrome, dummy jobs.
 * Layout matches the real Console (Pulse / Board / List + New job).
 */
export function DispatchTheater({ variant = "landing" }: DispatchTheaterProps) {
  const window = (
    <ProductWindow
      brand="Prism"
      product="Dispatch"
      meta="CPU 22% · MEM 7.9G"
      trailing={
        <div className="lt-pills" aria-hidden>
          <span className="lt-pill lt-pill--on">Pulse</span>
          <span className="lt-pill">Board</span>
          <span className="lt-pill">List</span>
        </div>
      }
    >
      <div className="lt-window__body lt-pulse" aria-hidden>
        <div className="lt-toolbar">
          <span className="lt-new">New job</span>
          <span className="lt-filter">Filter repos and jobs</span>
          <span className="lt-range">24h</span>
        </div>

        <section>
          <h3 className="lt-pulse__label">Live</h3>
          <article className="lt-card lt-card--live">
            <header className="lt-card__head">
              <span className="lt-mark">P</span>
              <div className="lt-card__id">
                <p className="lt-card__title">build:packages</p>
                <span className="lt-card__repo">
                  prism · host agent · checkout
                </span>
              </div>
              <span className="lt-badge lt-badge--live">Running</span>
            </header>
            <div className="lt-meter">
              <span className="lt-meter__wait" />
              <span className="lt-meter__work" />
            </div>
            <p className="lt-meter__legend">
              <span>waited 12s</span>
              <span>worked 1m 04s</span>
            </p>
            <p className="lt-cmd">
              <span className="lt-cmd__type">
                bun run typecheck · packages/ui
              </span>
              <span className="lt-cmd__caret">&nbsp;</span>
            </p>
          </article>
        </section>

        <section>
          <h3 className="lt-pulse__label">Needs you</h3>
          <article className="lt-card lt-card--wait">
            <header className="lt-card__head">
              <span className="lt-mark">P</span>
              <div className="lt-card__id">
                <p className="lt-card__title">resolve:conflict</p>
                <span className="lt-card__repo">
                  prism · waiting on a decision
                </span>
              </div>
              <span className="lt-badge lt-badge--wait">Needs you</span>
            </header>
            <p className="lt-card__repo">
              Dirty tree — keep working here, or isolate in a worktree?
            </p>
          </article>
        </section>

        <section>
          <h3 className="lt-pulse__label">Settled</h3>
          <article className="lt-card lt-card--done">
            <header className="lt-card__head">
              <span className="lt-mark">P</span>
              <div className="lt-card__id">
                <p className="lt-card__title">lint:core</p>
                <span className="lt-card__repo">
                  Checks passed · uncommitted
                </span>
              </div>
              <span className="lt-badge lt-badge--done">Settled</span>
            </header>
            <div className="lt-meter lt-meter--done">
              <span className="lt-meter__wait lt-meter__wait--done" />
              <span className="lt-meter__work lt-meter__work--done" />
            </div>
            <p className="lt-meter__legend">
              <span>waited 4s</span>
              <span>worked 2m 18s</span>
            </p>
          </article>
        </section>
      </div>
    </ProductWindow>
  );

  if (variant === "magazine") return window;

  return (
    <figure>
      {window}
      <figcaption className="mt-3 font-mono text-[11px] text-fd-muted-foreground">
        Console Pulse — New job, wait/work meters.
      </figcaption>
    </figure>
  );
}
