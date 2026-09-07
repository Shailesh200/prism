"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ProductWindow } from "@/components/product-window";
import { prefersReducedMotion } from "@/lib/gsap";

function ltStyle(vars: Record<`--${string}`, string>): CSSProperties {
  return vars as CSSProperties;
}

const TABS = [
  { id: "dna", label: "DNA Analysis" },
  { id: "blast", label: "Blast Radius" },
  { id: "domains", label: "Domains" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const RAIL = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Map" },
  { id: "dna", label: "DNA" },
  { id: "blast", label: "Blast" },
  { id: "domains", label: "Domains" },
] as const;

const LANGS = [
  { name: "TypeScript", pct: 78, color: "var(--prism-brand)" },
  { name: "CSS", pct: 14, color: "var(--prism-violet)" },
  { name: "JSON", pct: 8, color: "var(--prism-amber)" },
] as const;

const FACTORS = [
  { name: "Coupling", score: 62, tone: "warn" },
  { name: "Tests", score: 88, tone: "ok" },
  { name: "Churn", score: 81, tone: "ok" },
  { name: "Ownership", score: 90, tone: "ok" },
] as const;

const BLAST_HITS = [
  { path: "packages/dispatch/src/worker.ts", via: "imports" },
  { path: "packages/app-shell/src/JobConsole.tsx", via: "imports" },
  { path: "packages/dispatch/src/runtime.ts", via: "calls" },
  { path: "packages/mcp-server/src/dispatch-registry.ts", via: "tests" },
] as const;

const DOMAINS = [
  { name: "Frontend", detected: true, note: "Next.js · React", conf: 94 },
  { name: "Backend", detected: true, note: "Node · APIs", conf: 88 },
  { name: "DevOps", detected: true, note: "CI · containers", conf: 76 },
  { name: "Mobile", detected: false, note: "not in this tree", conf: 0 },
  { name: "Desktop", detected: false, note: "not in this tree", conf: 0 },
  { name: "Data / ML", detected: false, note: "not in this tree", conf: 0 },
] as const;

/**
 * Playground Intelligence — DNA, Blast, Domains as looping product chrome.
 * Dummy data; motion matches Dispatch theater (CSS, reduced-motion static).
 */
export function IntelligenceTheater() {
  const [tab, setTab] = useState<TabId>("dna");

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const order: TabId[] = ["dna", "blast", "domains"];
    const id = window.setTimeout(() => {
      setTab((current) => {
        const i = order.indexOf(current);
        return order[(i + 1) % order.length] ?? "dna";
      });
    }, 5600);
    return () => window.clearTimeout(id);
  }, [tab]);

  return (
    <figure>
      <ProductWindow
        brand="Prism"
        product="Playground"
        meta="Intelligence · local index"
      >
        <div className="lt-window__body lt-intel">
          <nav className="lt-rail" aria-hidden>
            {RAIL.map((item) => (
              <span
                key={item.id}
                title={item.label}
                className={
                  item.id === tab
                    ? "lt-rail__item lt-rail__item--on"
                    : "lt-rail__item"
                }
              >
                <RailIcon id={item.id} />
              </span>
            ))}
          </nav>
          <div className="lt-intel__stage">
            <div
              className="lt-intel__tabs"
              role="tablist"
              aria-label="Intelligence"
            >
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={
                    tab === item.id
                      ? "lt-intel__tab lt-intel__tab--on"
                      : "lt-intel__tab"
                  }
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="lt-intel__panels">
              <div
                className={
                  tab === "dna"
                    ? "lt-intel__panel lt-intel__panel--on"
                    : "lt-intel__panel"
                }
                aria-hidden={tab !== "dna"}
              >
                <DnaPanel />
              </div>
              <div
                className={
                  tab === "blast"
                    ? "lt-intel__panel lt-intel__panel--on"
                    : "lt-intel__panel"
                }
                aria-hidden={tab !== "blast"}
              >
                <BlastPanel />
              </div>
              <div
                className={
                  tab === "domains"
                    ? "lt-intel__panel lt-intel__panel--on"
                    : "lt-intel__panel"
                }
                aria-hidden={tab !== "domains"}
              >
                <DomainsPanel />
              </div>
            </div>
          </div>
        </div>
      </ProductWindow>
      <figcaption className="mt-3 font-mono text-[11px] text-fd-muted-foreground">
        Playground Intelligence — DNA, blast radius, and domains. Dummy data.
      </figcaption>
    </figure>
  );
}

function DnaPanel() {
  return (
    <>
      <div className="lt-intel__head">
        <div>
          <p className="lt-intel__title">DNA Analysis</p>
          <p className="lt-intel__sub">prism · main · TypeScript monorepo</p>
        </div>
        <span className="lt-badge lt-badge--live">Local</span>
      </div>
      <div className="lt-dna">
        <div className="lt-dna__hero">
          <div className="lt-dna__score">
            <svg viewBox="0 0 88 88" className="lt-dna__ring" aria-hidden>
              <circle className="lt-dna__ring-track" cx="44" cy="44" r="36" />
              <circle className="lt-dna__ring-fill" cx="44" cy="44" r="36" />
            </svg>
            <div className="lt-dna__score-n">
              <strong>86</strong>
              <span>Grade A</span>
            </div>
          </div>
          <div className="lt-dna__helix-wrap">
            <span className="lt-dna__scan" />
            <svg className="lt-dna__helix" viewBox="0 0 160 88" aria-hidden>
              <path
                className="lt-dna__strand lt-dna__strand--a"
                d="M8 16 C 40 16, 40 72, 72 72 S 104 16, 136 16"
              />
              <path
                className="lt-dna__strand lt-dna__strand--b"
                d="M8 72 C 40 72, 40 16, 72 16 S 104 72, 152 72"
              />
              <g className="lt-dna__rungs">
                <line x1="28" y1="28" x2="28" y2="60" />
                <line x1="52" y1="24" x2="52" y2="64" />
                <line x1="80" y1="22" x2="80" y2="66" />
                <line x1="108" y1="24" x2="108" y2="64" />
                <line x1="132" y1="28" x2="132" y2="60" />
              </g>
              <circle className="lt-dna__bead lt-dna__bead--a" r="3.5" />
              <circle className="lt-dna__bead lt-dna__bead--b" r="3.5" />
            </svg>
          </div>
        </div>
        <div className="lt-dna__langs">
          {LANGS.map((lang) => (
            <div key={lang.name} className="lt-dna__lang">
              <span>
                {lang.name}
                <b>{lang.pct}%</b>
              </span>
              <i>
                <em
                  style={ltStyle({
                    "--lt-bar": `${lang.pct}%`,
                    "--lt-bar-color": lang.color,
                  })}
                />
              </i>
            </div>
          ))}
        </div>
        <div className="lt-dna__factors">
          {FACTORS.map((factor) => (
            <div
              key={factor.name}
              className={`lt-dna__factor lt-dna__factor--${factor.tone}`}
            >
              <span>
                {factor.name}
                <b>{factor.score}</b>
              </span>
              <i>
                <em style={ltStyle({ "--lt-bar": `${factor.score}%` })} />
              </i>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function BlastPanel() {
  return (
    <>
      <div className="lt-intel__head">
        <div>
          <p className="lt-intel__title">Blast Radius</p>
          <p className="lt-blast__target">
            <span className="lt-blast__type">
              packages/dispatch/src/queue.ts
            </span>
            <span className="lt-blast__caret" />
          </p>
        </div>
        <span className="lt-badge lt-badge--live">Tracing</span>
      </div>
      <div className="lt-blast">
        <div className="lt-blast__viz" aria-hidden>
          <span className="lt-blast__ring" />
          <span className="lt-blast__ring" />
          <span className="lt-blast__ring" />
          <span className="lt-blast__core" />
          <span className="lt-blast__risk">High</span>
        </div>
        <div className="lt-blast__metrics">
          <div className="lt-iris__tile">
            <span>Risk</span>
            <strong>High · 14 files</strong>
          </div>
          <div className="lt-iris__tile">
            <span>Tests to run</span>
            <strong>3 suites</strong>
          </div>
        </div>
        <div className="lt-blast__list">
          {BLAST_HITS.map((hit) => (
            <div key={hit.path} className="lt-blast__row">
              <b>{hit.path}</b>
              <span>{hit.via}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function DomainsPanel() {
  return (
    <>
      <div className="lt-intel__head">
        <div>
          <p className="lt-intel__title">Domains</p>
          <p className="lt-intel__sub">3 of 6 stack domains detected</p>
        </div>
        <span className="lt-badge lt-badge--live">Detecting</span>
      </div>
      <div className="lt-domains">
        {DOMAINS.map((domain) => (
          <div
            key={domain.name}
            className={
              domain.detected ? "lt-domain lt-domain--on" : "lt-domain"
            }
            style={ltStyle({ "--lt-conf": `${domain.conf}%` })}
          >
            <strong>{domain.name}</strong>
            <span>
              {domain.detected ? "Detected" : "Catalog"} · {domain.note}
            </span>
            <i className="lt-domain__conf" aria-hidden>
              <em />
            </i>
          </div>
        ))}
      </div>
    </>
  );
}

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
  if (id === "domains") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 2.5v11M2.5 8h11" />
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
