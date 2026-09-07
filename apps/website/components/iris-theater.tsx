import Image from "next/image";
import { Counter } from "@/components/motion/Counter";
import { ProductWindow } from "@/components/product-window";

const FACTS = [
  {
    id: "health",
    label: "Health",
    value: "A · 86",
    tone: "emerald",
    icon: "health",
  },
  {
    id: "testing",
    label: "Testing",
    value: "88",
    tone: "violet",
    icon: "testing",
  },
  {
    id: "security",
    label: "Security",
    value: "91",
    tone: "accent",
    icon: "security",
  },
  {
    id: "landmarks",
    label: "Landmarks",
    value: "12 named",
    tone: "amber",
    icon: "landmarks",
  },
  {
    id: "clusters",
    label: "Clusters",
    value: "6",
    tone: "brand",
    icon: "clusters",
  },
  {
    id: "domain",
    label: "Domain",
    value: "Frontend",
    tone: "brand",
    icon: "domain",
  },
] as const;

const LEAVES = [0, 60, 120, 180, 240, 300] as const;

const NODES = [
  { cx: 80, cy: 12, tone: "brand" },
  { cx: 136, cy: 48, tone: "violet" },
  { cx: 136, cy: 112, tone: "accent" },
  { cx: 80, cy: 148, tone: "amber" },
  { cx: 24, cy: 112, tone: "emerald" },
  { cx: 24, cy: 48, tone: "brand" },
] as const;

/**
 * Console Iris — aperture, facts, index log. Dummy figures; no persona.
 */
export function IrisTheater() {
  return (
    <figure>
      <ProductWindow
        brand="Prism"
        product="Iris"
        meta="local index · 0 network calls"
        trailing={
          <div className="lt-pills" aria-hidden>
            <span className="lt-pill">Dashboard</span>
            <span className="lt-pill">Attention</span>
            <span className="lt-pill lt-pill--on">Iris</span>
          </div>
        }
      >
        <div className="lt-window__body lt-iris">
          <span className="lt-iris__scanline" aria-hidden />
          <div className="lt-iris__hero">
            <Aperture />
            <div className="lt-iris__stat">
              <div className="lt-iris__stat-row">
                <p className="lt-iris__kicker">Iris has indexed</p>
                <span className="lt-badge lt-badge--live">Local</span>
              </div>
              <p className="lt-iris__count">
                <Counter value={14204} grouped />
                <span className="lt-iris__unit">symbols</span>
              </p>
              <p className="lt-iris__meta">
                prism · main · 1 workspace · 4m ago
              </p>
            </div>
          </div>
          <div className="lt-iris__grid" aria-hidden>
            {FACTS.map((fact) => (
              <div
                key={fact.id}
                className={`lt-iris__fact lt-iris__fact--${fact.tone}`}
              >
                <span className="lt-iris__glyph">
                  <FactIcon id={fact.icon} />
                </span>
                <div>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              </div>
            ))}
          </div>
          <div className="lt-log" aria-hidden>
            <p>
              <em>iris</em> indexed packages/dispatch
            </p>
            <p>
              <em>graph</em> 1,204 edges · 0 cycles in core
            </p>
            <p>
              <em>health</em> grade A · drift −0.4 this week
            </p>
            <p>
              <em>spectrum</em> map ready · local, no network
            </p>
          </div>
        </div>
      </ProductWindow>
      <figcaption className="mt-3 font-mono text-[11px] text-fd-muted-foreground">
        Iris is infrastructure copy — never first person, never an avatar.
      </figcaption>
    </figure>
  );
}

function Aperture() {
  return (
    <div className="lt-aperture-wrap" aria-hidden>
      <span className="lt-aperture__scan" />
      <svg className="lt-aperture" viewBox="0 0 160 160">
        <defs>
          <clipPath id="lt-iris-clip">
            <circle cx="80" cy="80" r="70" />
          </clipPath>
          <radialGradient id="lt-iris-glow" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor="var(--prism-brand)"
              stopOpacity="0.38"
            />
            <stop
              offset="70%"
              stopColor="var(--prism-violet)"
              stopOpacity="0.12"
            />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle cx="80" cy="80" r="72" fill="url(#lt-iris-glow)" />
        <g clipPath="url(#lt-iris-clip)">
          <g className="lt-aperture__leaves">
            {LEAVES.map((deg) => (
              <path
                key={deg}
                className="lt-aperture__leaf"
                transform={`rotate(${deg} 80 80)`}
                d="M80 12 L 104 54 L 80 68 L 56 54 Z"
              />
            ))}
          </g>
        </g>
        <circle
          className="lt-aperture__ring lt-aperture__ring--outer"
          cx="80"
          cy="80"
          r="70"
        />
        <circle
          className="lt-aperture__ring lt-aperture__ring--mid"
          cx="80"
          cy="80"
          r="46"
        />
        <circle className="lt-aperture__hole" cx="80" cy="80" r="20" />
        {NODES.map((node) => (
          <circle
            key={`${node.cx}-${node.cy}`}
            className={`lt-aperture__node lt-aperture__node--${node.tone}`}
            cx={node.cx}
            cy={node.cy}
            r="4.2"
          />
        ))}
      </svg>
      <Image
        className="lt-aperture__mark"
        src="/brand/prism-mark.png"
        width={28}
        height={28}
        alt=""
      />
    </div>
  );
}

function FactIcon({ id }: { id: (typeof FACTS)[number]["icon"] }) {
  const common = {
    viewBox: "0 0 16 16",
    width: 16,
    height: 16,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (id === "health") {
    return (
      <svg {...common}>
        <polyline points="1.5 8.5 4.5 8.5 6.5 3.5 9.5 12.5 11.5 7.5 14.5 7.5" />
      </svg>
    );
  }
  if (id === "testing") {
    return (
      <svg {...common}>
        <path d="M6 2h4M7 2v4.2L3.8 13.2A1.6 1.6 0 0 0 5.2 15.5h5.6a1.6 1.6 0 0 0 1.4-2.3L8.9 6.2V2" />
      </svg>
    );
  }
  if (id === "security") {
    return (
      <svg {...common}>
        <path d="M8 1.8 13.2 4v4.4c0 3.2-2.1 5.2-5.2 6.2-3.1-1-5.2-3-5.2-6.2V4L8 1.8Z" />
        <path d="M6.2 8.1 7.5 9.4 10 6.6" />
      </svg>
    );
  }
  if (id === "landmarks") {
    return (
      <svg {...common}>
        <path d="M2.4 14.3h11.2" />
        <path d="M8 1.8 13.4 6.2H2.6L8 1.8Z" />
        <path d="M4.4 6.2v8.1M8 6.2v8.1M11.6 6.2v8.1" />
        <path d="M3.4 6.2h9.2" />
      </svg>
    );
  }
  if (id === "clusters") {
    return (
      <svg {...common}>
        <rect x="1.8" y="1.8" width="5.2" height="5.2" rx="0.8" />
        <rect x="9" y="1.8" width="5.2" height="5.2" rx="0.8" />
        <rect x="1.8" y="9" width="5.2" height="5.2" rx="0.8" />
        <rect x="9" y="9" width="5.2" height="5.2" rx="0.8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.6" />
      <path d="M8 2.5v2.2M8 11.3v2.2M2.5 8h2.2M11.3 8h2.2" />
    </svg>
  );
}
