import { ProductWindow } from "@/components/product-window";

const PACK = [
  {
    path: "src/users/fetchUser.ts",
    why: "feature · import distance 1",
  },
  {
    path: "src/users/lruCache.ts",
    why: "reuse · existing helper",
  },
  {
    path: "src/users/fetchUser.test.ts",
    why: "colocated test",
  },
] as const;

/**
 * Prepare pack chrome — paths and why, never file bodies.
 */
export function PrepareTheater() {
  return (
    <figure>
      <ProductWindow
        brand="Prism"
        product="Prepare"
        meta="pack · reuse · House Style"
      >
        <div className="lt-window__body lt-stack">
          <div className="lt-stack__head">
            <p className="lt-pulse__label">add caching to fetchUser</p>
            <span className="lt-badge lt-badge--done">No bodies</span>
          </div>
          <ul className="lt-stack__rows" aria-hidden>
            {PACK.map((row) => (
              <li key={row.path} className="lt-stack__row">
                <span className="lt-stack__path">{row.path}</span>
                <em>{row.why}</em>
              </li>
            ))}
          </ul>
          <div className="lt-log">
            <p>
              <em>reuse</em> lruCache · score 0.81
            </p>
            <p>
              <em>style</em> route-handler · handlers next to the route
            </p>
            <p>
              <em>order</em> vendor/legacy.ts off-limits · advisory
            </p>
          </div>
        </div>
      </ProductWindow>
      <figcaption className="mt-3 font-mono text-[11px] text-fd-muted-foreground">
        Dummy pack. Map tokens, not file size.
      </figcaption>
    </figure>
  );
}
