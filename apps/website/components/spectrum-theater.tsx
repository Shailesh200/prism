import { HeroConstellation } from "@/components/hero-constellation";
import { ProductWindow } from "@/components/product-window";

const RAIL = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Map", on: true },
  { id: "dna", label: "DNA" },
  { id: "blast", label: "Blast" },
  { id: "jobs", label: "Jobs" },
] as const;

function RailIcon({ id }: { id: (typeof RAIL)[number]["id"] }) {
  const common = {
    viewBox: "0 0 16 16",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    "aria-hidden": true as const,
  };
  if (id === "map") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2.2" />
        <path d="M3 8h3M10 8h3M8 3v3M8 10v3" />
      </svg>
    );
  }
  if (id === "dna") {
    return (
      <svg {...common}>
        <path d="M5 3c4 3 2 7 6 10M11 3C7 6 9 10 5 13" />
      </svg>
    );
  }
  if (id === "blast") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.5" />
        <circle cx="8" cy="8" r="2" />
      </svg>
    );
  }
  if (id === "jobs") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="10" height="9" rx="1.5" />
        <path d="M6 4V3h4v1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.8" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="0.8" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.8" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="0.8" />
    </svg>
  );
}

/**
 * Playground chrome around Spectrum — the same map Iris shows.
 * Dummy packages; the motion is the product graph, not a marketing orb.
 */
export function SpectrumTheater() {
  return (
    <figure>
      <ProductWindow
        brand="Prism"
        product="Playground"
        meta="Playground · local · not hosted"
      >
        <div className="lt-window__body lt-play">
          <nav className="lt-rail" aria-hidden>
            {RAIL.map((item) => (
              <span
                key={item.id}
                title={item.label}
                className={
                  item.id === "map"
                    ? "lt-rail__item lt-rail__item--on"
                    : "lt-rail__item"
                }
              >
                <RailIcon id={item.id} />
              </span>
            ))}
          </nav>
          <div className="lt-play__stage">
            <p className="absolute left-4 top-3 z-10 font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--prism-brand)]">
              Spectrum
            </p>
            <HeroConstellation />
          </div>
        </div>
      </ProductWindow>
      <figcaption className="mt-3 font-mono text-[11px] text-fd-muted-foreground">
        Spectrum is Repository Map — Playground, Console, and the IDE share it.
      </figcaption>
    </figure>
  );
}
