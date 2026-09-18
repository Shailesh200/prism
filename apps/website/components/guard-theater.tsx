import { ProductWindow } from "@/components/product-window";

const HUNKS = [
  {
    path: "packages/dispatch/src/worker.ts",
    flag: "blast high",
    tone: "wait" as const,
  },
  {
    path: "packages/core/src/workspace.ts",
    flag: "boundary",
    tone: "wait" as const,
  },
  {
    path: "src/users/newHelper.ts",
    flag: "orphan",
    tone: "done" as const,
  },
] as const;

/**
 * Guard session chrome — read-first ranking of this session’s dirt.
 */
export function GuardTheater() {
  return (
    <figure>
      <ProductWindow
        brand="Prism"
        product="Guard"
        meta="session − pre-existing"
      >
        <div className="lt-window__body lt-stack">
          <div className="lt-stack__head">
            <p className="lt-pulse__label">Read first</p>
            <span className="lt-badge lt-badge--wait">2 high</span>
          </div>
          <ul className="lt-stack__rows" aria-hidden>
            {HUNKS.map((row, i) => (
              <li
                key={row.path}
                className={`lt-stack__row lt-stack__row--ranked lt-stack__row--${row.tone}`}
              >
                <strong>{String(i + 1).padStart(2, "0")}</strong>
                <span className="lt-stack__path">{row.path}</span>
                <em>{row.flag}</em>
              </li>
            ))}
          </ul>
          <div className="lt-log">
            <p>
              <em>session</em> 3 dirty · 17 pre-existing excluded
            </p>
            <p>
              <em>duplicate</em> none in this hunk set
            </p>
          </div>
        </div>
      </ProductWindow>
      <figcaption className="mt-3 font-mono text-[11px] text-fd-muted-foreground">
        Dummy ranking. Guard does not say the edit is correct.
      </figcaption>
    </figure>
  );
}
