"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { Counter } from "@/components/motion/Counter";
import { ensureGsap, prefersReducedMotion, safeSetVisible } from "@/lib/gsap";

/**
 * Living schematic for the landing hero: Core in the middle, engine
 * internals above, surfaces around the rim.
 *
 * Three layers, each with its own parallax depth: the grid, the graph (edges
 * drawn with DrawSVG, then a blast pulse ripples out of `core`), and a dock
 * of stat chips. The chips are real content, not part of the aria-hidden
 * decoration.
 *
 * Reduced motion gets the same scene fully drawn and static. The cleanup
 * path forces everything visible so a mid-animation unmount can never
 * strand a half-drawn graph.
 */

type Tone = "brand" | "accent" | "amber";

type NodeSpec = {
  id: string;
  x: number;
  y: number;
  r: number;
  tone: Tone;
  labelY: number;
};

const NODES: NodeSpec[] = [
  { id: "core", x: 400, y: 200, r: 40, tone: "brand", labelY: 258 },
  { id: "analyzer", x: 248, y: 108, r: 22, tone: "accent", labelY: 78 },
  { id: "graph", x: 552, y: 104, r: 22, tone: "brand", labelY: 74 },
  { id: "mcp", x: 648, y: 228, r: 20, tone: "accent", labelY: 264 },
  { id: "cli", x: 168, y: 248, r: 20, tone: "brand", labelY: 284 },
  { id: "ide", x: 292, y: 328, r: 18, tone: "accent", labelY: 362 },
  { id: "dispatch", x: 528, y: 324, r: 22, tone: "amber", labelY: 362 },
];

const EDGES: Array<[string, string]> = [
  ["core", "analyzer"],
  ["core", "graph"],
  ["core", "mcp"],
  ["core", "cli"],
  ["core", "ide"],
  ["core", "dispatch"],
  ["analyzer", "graph"],
  ["graph", "mcp"],
];

const STATS = [
  { value: 41, label: "MCP tools" },
  { value: 5, label: "surfaces" },
  { value: 0, label: "network calls" },
] as const;

function node(id: string): NodeSpec {
  const n = NODES.find((candidate) => candidate.id === id);
  if (!n) throw new Error(`unknown node ${id}`);
  return n;
}

function toneStroke(tone: Tone): string {
  if (tone === "accent") return "var(--prism-accent)";
  if (tone === "amber") return "#f59e0b";
  return "var(--prism-brand)";
}

function relatedTo(focus: string | null, id: string): boolean {
  if (!focus) return true;
  if (id === focus) return true;
  return EDGES.some(
    ([from, to]) =>
      (from === focus && to === id) || (to === focus && from === id),
  );
}

function edgeRelated(focus: string | null, from: string, to: string): boolean {
  if (!focus) return true;
  return from === focus || to === focus;
}

export function HeroConstellation() {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const gsap = ensureGsap();

      const edges = root.querySelectorAll<SVGPathElement>("[data-edge]");
      const nodes = root.querySelectorAll("[data-node]");
      const labels = root.querySelectorAll("[data-label]");
      const halos = root.querySelectorAll("[data-halo]");
      const chips = root.querySelectorAll("[data-chip]");
      const everything = [edges, nodes, labels, halos, chips];

      if (prefersReducedMotion()) {
        safeSetVisible(everything);
        gsap.set(edges, { drawSVG: "100%" });
        return;
      }

      gsap.set(edges, { drawSVG: "0%" });
      gsap.set([nodes, labels], { autoAlpha: 0 });
      gsap.set(chips, { autoAlpha: 0, y: 10 });
      gsap.set(halos, {
        autoAlpha: 0,
        scale: 0.4,
        transformOrigin: "50% 50%",
      });

      const intro = gsap.timeline({ defaults: { ease: "power2.inOut" } });
      intro.to(edges, { drawSVG: "100%", duration: 1.2, stagger: 0.09 });
      intro.to(
        nodes,
        { autoAlpha: 1, duration: 0.45, stagger: 0.07, ease: "power3.out" },
        0.35,
      );
      intro.to(
        labels,
        { autoAlpha: 1, duration: 0.4, stagger: 0.05, ease: "power3.out" },
        0.6,
      );
      intro.to(
        chips,
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.1,
          ease: "power3.out",
        },
        0.9,
      );

      const pulse = gsap.timeline({
        repeat: -1,
        repeatDelay: 2.4,
        delay: 1.8,
        defaults: { ease: "power2.out" },
      });
      pulse.to(halos, {
        autoAlpha: 0.9,
        scale: 1,
        duration: 1.1,
        stagger: 0.28,
      });
      pulse.to(
        halos,
        { autoAlpha: 0, scale: 1.5, duration: 0.9, stagger: 0.28 },
        1.1,
      );
      pulse.to(
        edges,
        { strokeOpacity: 0.85, duration: 0.35, stagger: 0.06 },
        0.25,
      );
      pulse.to(
        edges,
        { strokeOpacity: 0.4, duration: 0.8, stagger: 0.05 },
        1.2,
      );

      const graph = root.querySelector("[data-layer-graph]");
      const graphX = gsap.quickTo(graph, "x", {
        duration: 0.7,
        ease: "power3",
      });
      const graphY = gsap.quickTo(graph, "y", {
        duration: 0.7,
        ease: "power3",
      });

      const onPointer = (event: PointerEvent): void => {
        const rect = root.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / rect.width - 0.5;
        const ny = (event.clientY - rect.top) / rect.height - 0.5;
        graphX(nx * 8);
        graphY(ny * 6);
      };
      root.addEventListener("pointermove", onPointer, { passive: true });

      const applyFocus = (id: string | null): void => {
        root.querySelectorAll("[data-spoke]").forEach((el) => {
          const spoke = el.getAttribute("data-spoke") ?? "";
          el.setAttribute("data-dim", relatedTo(id, spoke) ? "0" : "1");
        });
        root.querySelectorAll("[data-edge]").forEach((el) => {
          const from = el.getAttribute("data-from") ?? "";
          const to = el.getAttribute("data-to") ?? "";
          el.setAttribute("data-dim", edgeRelated(id, from, to) ? "0" : "1");
        });
      };

      const onSpokeEnter = (event: Event): void => {
        const id = (event.currentTarget as Element).getAttribute("data-spoke");
        applyFocus(id);
      };
      const onSpokeLeave = (): void => applyFocus(null);
      const spokes = root.querySelectorAll("[data-spoke]");
      spokes.forEach((el) => {
        el.addEventListener("pointerenter", onSpokeEnter);
        el.addEventListener("pointerleave", onSpokeLeave);
      });

      return () => {
        root.removeEventListener("pointermove", onPointer);
        spokes.forEach((el) => {
          el.removeEventListener("pointerenter", onSpokeEnter);
          el.removeEventListener("pointerleave", onSpokeLeave);
        });
        intro.kill();
        pulse.kill();
        safeSetVisible(everything);
        gsap.set(edges, { clearProps: "all", drawSVG: "100%" });
      };
    },
    { scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      className="relative flex h-full min-h-[320px] w-full flex-col overflow-hidden md:min-h-[480px] lg:min-h-full"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_oklab,var(--prism-brand)_22%,transparent),transparent_55%),radial-gradient(ellipse_at_80%_60%,color-mix(in_oklab,var(--prism-accent)_16%,transparent),transparent_50%),var(--prism-canvas)]" />
      <div
        className="absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--prism-line) 1px, transparent 1px),
            linear-gradient(to bottom, var(--prism-line) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />
      <div className="pointer-events-none absolute inset-3 rounded-xl border border-fd-border/70 md:inset-4" />

      <div className="relative min-h-0 flex-1">
        <svg
          data-layer-graph
          aria-hidden
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 800 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse
            cx="400"
            cy="200"
            rx="250"
            ry="150"
            stroke="var(--prism-line)"
            strokeOpacity="0.55"
            strokeDasharray="3 7"
          />

          {EDGES.map(([from, to]) => {
            const a = node(from);
            const b = node(to);
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2 - 20;
            return (
              <path
                key={`${from}-${to}`}
                data-edge
                data-from={from}
                data-to={to}
                data-dim="0"
                className="transition-opacity duration-200 data-[dim=1]:opacity-20"
                d={`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`}
                stroke="var(--prism-brand)"
                strokeWidth="1.5"
                strokeOpacity="0.4"
              />
            );
          })}

          <ellipse
            data-halo
            cx="400"
            cy="200"
            rx="88"
            ry="60"
            stroke="var(--prism-brand)"
            strokeOpacity="0.5"
          />
          <ellipse
            data-halo
            cx="400"
            cy="200"
            rx="148"
            ry="100"
            stroke="var(--prism-accent)"
            strokeOpacity="0.3"
          />

          {NODES.map((n) => {
            const stroke = toneStroke(n.tone);
            return (
              <g
                key={n.id}
                data-spoke={n.id}
                data-dim="0"
                className="cursor-pointer transition-opacity duration-200 data-[dim=1]:opacity-20"
              >
                <circle cx={n.x} cy={n.y} r={n.r + 8} fill="transparent" />
                <circle
                  data-node
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  fill={`color-mix(in oklab, ${stroke} 18%, var(--prism-canvas))`}
                  stroke={stroke}
                  strokeWidth={n.id === "core" ? 2 : 1.5}
                />
                {n.id === "core" ? (
                  <>
                    <line
                      x1={n.x - 10}
                      y1={n.y}
                      x2={n.x + 10}
                      y2={n.y}
                      stroke={stroke}
                      strokeOpacity="0.7"
                    />
                    <line
                      x1={n.x}
                      y1={n.y - 10}
                      x2={n.x}
                      y2={n.y + 10}
                      stroke={stroke}
                      strokeOpacity="0.7"
                    />
                  </>
                ) : null}
                <text
                  data-label
                  x={n.x}
                  y={n.labelY}
                  textAnchor="middle"
                  fill="var(--color-fd-foreground)"
                  stroke="var(--prism-canvas)"
                  strokeWidth="5"
                  paintOrder="stroke"
                  fontSize="11"
                  fontFamily="var(--font-mono), monospace"
                >
                  {n.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="relative z-10 flex flex-wrap items-end justify-between gap-3 border-t border-fd-border bg-fd-card/80 px-4 py-3 backdrop-blur md:px-5">
        <div className="space-y-1">
          <p className="font-mono text-[10px] tracking-wide text-fd-muted-foreground">
            repository map · local index
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-fd-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[var(--prism-brand)]" />
              engine
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[var(--prism-accent)]" />
              surface
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#f59e0b]" />
              dispatch
            </span>
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3">
          {STATS.map((s) => (
            <div
              key={s.label}
              data-chip
              className="min-w-[4.5rem] rounded-md border border-fd-border bg-fd-background/70 px-3 py-1.5"
            >
              <div className="font-display text-lg font-semibold leading-none text-fd-foreground">
                <Counter value={s.value} />
              </div>
              <div className="mt-1 font-mono text-[10px] tracking-wide text-fd-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
