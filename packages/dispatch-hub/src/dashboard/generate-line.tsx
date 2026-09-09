/**
 * Compact Architecture flow: a thin wire with a packet travelling it.
 * Same motion as the portfolio Work → Architecture `SystemDiagram`
 * (`motionPath` packets on a 1.25px stroke), flattened to one hop for the
 * generate chip — not a scaleX hairline or a labelled hop rail.
 */
import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import type { SkillGenerateStage } from "./skill-generate.js";

let plugins = false;

function ensureMotionPath(): typeof gsap {
  if (!plugins) {
    gsap.registerPlugin(MotionPathPlugin);
    plugins = true;
  }
  return gsap;
}

export function GenerateFlow(props: {
  readonly stage?: SkillGenerateStage;
  /** Pulse live cards pass this without a skill stage. */
  readonly moving?: boolean;
  readonly className?: string;
}): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const settled =
    props.moving !== undefined
      ? !props.moving
      : props.stage === "Done" || props.stage === "Failed";

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sync = () => {
      const next = Math.round(root.getBoundingClientRect().width);
      setWidth((prev) => (prev === next ? prev : next));
    };
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(sync);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || width < 16) return;
    const g = ensureMotionPath();
    const wire = root.querySelector<SVGPathElement>("[data-wire]");
    const packet = root.querySelector<SVGGElement>("[data-packet]");
    if (!wire || !packet) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const along = (at: number) => ({
      path: wire,
      align: wire,
      alignOrigin: [0.5, 0.5] as [number, number],
      start: at,
      end: at,
    });

    if (settled || reduced) {
      g.set(packet, {
        autoAlpha: 1,
        motionPath: along(1),
      });
      return () => {
        g.set(packet, { clearProps: "all" });
      };
    }

    g.set(packet, { autoAlpha: 1, motionPath: along(0) });
    const flight = g.to(packet, {
      motionPath: { path: wire, align: wire, alignOrigin: [0.5, 0.5] },
      duration: 2.4,
      repeat: -1,
      ease: "power1.inOut",
    });

    return () => {
      flight.kill();
      g.set(packet, { clearProps: "all" });
    };
  }, [props.moving, props.stage, settled, width]);

  const w = Math.max(width, 80);
  const y = 8;
  const pad = 8;

  return (
    <div
      ref={rootRef}
      className={["skills-generate__flow", props.className]
        .filter(Boolean)
        .join(" ")}
      data-tone={
        props.stage === "Failed"
          ? "rose"
          : props.stage === "Done"
            ? "emerald"
            : undefined
      }
      aria-hidden
    >
      {width > 0 ? (
        <svg
          className="skills-generate__flow-svg"
          viewBox={`0 0 ${w} 16`}
          fill="none"
        >
          <path
            data-wire
            d={`M ${pad} ${y} H ${w - pad}`}
            stroke="currentColor"
            strokeWidth="1.25"
            strokeOpacity="0.55"
            strokeLinecap="round"
          />
          <circle
            cx={pad}
            cy={y}
            r="2.5"
            fill="currentColor"
            fillOpacity="0.4"
          />
          <g data-packet>
            <circle r="3.5" fill="currentColor" />
            <circle r="2" className="skills-generate__packet-core" />
          </g>
        </svg>
      ) : null}
    </div>
  );
}
