import { ProductWindow } from "@/components/product-window";

const ROWS = [
  { label: "Bytes kept vs dump", value: "18%", note: "measured" },
  { label: "Δ vs last week", value: "−4 pts", note: "leaner" },
  { label: "Follow-through", value: "4 / 5", note: "heuristic" },
  { label: "Truncated lists", value: "12", note: "said so" },
] as const;

/**
 * Console Iris Envelope scoreboard — dummy figures, no persona.
 */
export function EnvelopeTheater() {
  return (
    <figure>
      <ProductWindow
        brand="Prism"
        product="Iris"
        meta="Envelope · local ledger"
        trailing={
          <div className="lt-pills" aria-hidden>
            <span className="lt-pill">Dashboard</span>
            <span className="lt-pill lt-pill--on">Iris</span>
          </div>
        }
      >
        <div className="lt-window__body lt-stack">
          <div className="lt-stack__head">
            <p className="lt-pulse__label">Envelope · prism</p>
            <span className="lt-badge lt-badge--live">Local</span>
          </div>
          <p className="lt-stack__dek">
            Receipts for Intelligence calls. No prompts. No source.
          </p>
          <ul className="lt-stack__rows" aria-hidden>
            {ROWS.map((row) => (
              <li key={row.label} className="lt-stack__row">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
                <em>{row.note}</em>
              </li>
            ))}
          </ul>
          <div className="lt-log">
            <p>
              <em>search_symbols</em> 50 of 60 · truncated
            </p>
            <p>
              <em>prepare_change</em> pack 8 · 1.9k map tokens
            </p>
            <p>
              <em>ledger</em> ~/.prism/envelope-ledger.jsonl
            </p>
          </div>
        </div>
      </ProductWindow>
      <figcaption className="mt-3 font-mono text-[11px] text-fd-muted-foreground">
        Dummy scoreboard. A missing week is “no sessions,” never 0%.
      </figcaption>
    </figure>
  );
}
