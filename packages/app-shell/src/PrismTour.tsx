import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import type { AppView } from "./AppSidebar.js";

export const TOUR_STORAGE_KEY = "prism.tour.v2";

const SPOTLIGHT_PAD = 6;
/** Keep ring border + 1px outer halo fully inside the viewport (never paint above y=0). */
const RING_EDGE_INSET = 4;
const CARD_GAP = 14;
const CARD_WIDTH = 360;
const VIEWPORT_PAD = 12;
/** Extra retries after shell navigation mounts the destination screen. */
const MEASURE_RETRY_MS = [0, 48, 120, 280, 560, 900, 1400] as const;

export type TourStep = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** CSS selector for the element to spotlight (prefer `[data-prism-tour="…"]`). */
  readonly target?: string;
  /** Tried when `target` is missing from the DOM (e.g. screen not mounted yet). */
  readonly fallbackTarget?: string;
  /** Navigate the shell to this view before measuring the target. */
  readonly navigateTo?: AppView;
  /**
   * Spotlight is in-pane main content — do not force-expand the hover rail
   * (avoids the ring overlapping the sidebar and the coach card sitting on it).
   */
  readonly collapseSidebar?: boolean;
};

const DEFAULT_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Prism",
    body: "Prism maps your repository locally — health, DNA, blast radius, and ownership — without sending code to the cloud.",
    target: '[data-prism-tour="welcome"]',
    navigateTo: "overview",
  },
  {
    id: "overview",
    title: "Overview",
    body: "Your dashboard for health score, stack DNA, and recent signals. Jump anywhere from the left nav.",
    target: '[data-prism-tour="overview"]',
    navigateTo: "overview",
  },
  {
    id: "map",
    title: "Repository Map",
    body: "Explore packages and files as a chart. Select a node for ownership and blast radius, and bookmark areas you revisit.",
    target: '[data-prism-tour="map"]',
    navigateTo: "map",
  },
  {
    id: "profile",
    title: "Codebase Profile",
    body: "A structured read of what this repo is — languages, frameworks, and how the tree is organized.",
    target: '[data-prism-tour="profile"]',
    navigateTo: "profile",
  },
  {
    id: "domains",
    title: "Domains",
    body: "Ownership and domain boundaries across the codebase. Open a domain to dig into stacks, APIs, and hotspots.",
    target: '[data-prism-tour="domains"]',
    navigateTo: "domains",
  },
  {
    id: "testing",
    title: "Testing & Security",
    body: "Coverage, test health, and security signals in one place — so risk is visible before you ship.",
    target: '[data-prism-tour="testing"]',
    navigateTo: "testing",
  },
  {
    id: "dna",
    title: "DNA Analysis",
    body: "Stack fingerprints and architectural DNA. Use this when you need to understand what the repo is made of.",
    target: '[data-prism-tour="dna"]',
    navigateTo: "dna",
  },
  {
    id: "impact",
    title: "Blast Radius",
    body: "See what a change touches before you merge. From the editor, right-click a file for Blast Radius.",
    target: '[data-prism-tour="impact"]',
    navigateTo: "blast",
  },
  {
    id: "trends",
    title: "Trends",
    body: "Health over time and region movers — catch regressions early without leaving the IDE.",
    target: '[data-prism-tour="trends"]',
    navigateTo: "trends",
  },
  {
    id: "review",
    title: "Change Review",
    body: "Aggregate blast radius across dirty files. From Source Control, use Review Changes on your selection.",
    target: '[data-prism-tour="review"]',
    navigateTo: "review",
    collapseSidebar: true,
  },
  {
    id: "explain",
    title: "Explain This Area",
    body: "A quick brief on a file or folder — domains, dependencies, and local ownership. Also available from the editor context menu.",
    target: '[data-prism-tour="explain"]',
    navigateTo: "explain",
    collapseSidebar: true,
  },
  {
    id: "integrations",
    title: "Integrations",
    body: "Optional connectors for CI and external signals. Everything stays local until you explicitly allow network access.",
    target: '[data-prism-tour="integrations"]',
    navigateTo: "integrations",
  },
  {
    id: "fresh",
    title: "Keep the index fresh",
    body: "Turn on Auto Re-Index so Prism updates after you save. The status bar shows Ready, Stale, or Indexing — click it for quick actions.",
    target: '[data-prism-tour="auto-reindex"]',
    fallbackTarget: '[data-prism-tour="indexing"]',
    navigateTo: "settings",
  },
];

export function isTourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === "done";
  } catch {
    return false;
  }
}

export function markTourCompleted(): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, "done");
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearTourCompleted(): void {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    // Prior tour key — clear so Settings → Open tour / Clear data always restart.
    localStorage.removeItem("prism.tour.v1");
  } catch {
    /* ignore */
  }
}

type SpotlightRect = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
};

type CardPlacement = {
  readonly top: number;
  readonly left: number;
  readonly placement: "below" | "above" | "right" | "left" | "center";
};

export type PrismTourProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly steps?: readonly TourStep[];
  /** Optional shell navigation so steps can reveal the right screen. */
  readonly onNavigate?: (view: AppView) => void;
};

function resolveTarget(
  step: TourStep,
  options?: { readonly allowFallback?: boolean },
): Element | null {
  if (typeof document === "undefined") return null;
  if (step.target) {
    const primary = document.querySelector(step.target);
    if (primary) return primary;
  }
  if (options?.allowFallback !== false && step.fallbackTarget) {
    return document.querySelector(step.fallbackTarget);
  }
  return null;
}

function readRadius(el: Element): number {
  const style = window.getComputedStyle(el);
  const corners = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ].map((v) => Number.parseFloat(v));
  const parsed = corners.find((n) => Number.isFinite(n) && n > 0) ?? 8;
  return Math.min(Math.max(parsed, 6) + 2, 14);
}

/**
 * Build a spotlight hole inset enough that the 2px border + halo never need
 * pixels outside the viewport (avoids top-edge crop in webviews).
 */
function readSpotlight(el: Element): SpotlightRect {
  const rect = el.getBoundingClientRect();
  const pad = SPOTLIGHT_PAD;
  const inset = RING_EDGE_INSET;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = Math.round(rect.left - pad);
  let top = Math.round(rect.top - pad);
  let width = Math.round(rect.width + pad * 2);
  let height = Math.round(rect.height + pad * 2);

  width = Math.max(width, 28);
  height = Math.max(height, 28);

  if (top < inset) {
    height = Math.max(height - (inset - top), 28);
    top = inset;
  }
  if (left < inset) {
    width = Math.max(width - (inset - left), 28);
    left = inset;
  }
  if (top + height > vh - inset) {
    height = Math.max(vh - inset - top, 28);
  }
  if (left + width > vw - inset) {
    width = Math.max(vw - inset - left, 28);
  }

  return {
    top,
    left,
    width,
    height,
    radius: readRadius(el),
  };
}

function isUsableSpotlight(spot: SpotlightRect): boolean {
  return (
    spot.width >= 20 &&
    spot.height >= 16 &&
    spot.top < window.innerHeight &&
    spot.left < window.innerWidth &&
    spot.top + spot.height > 0 &&
    spot.left + spot.width > 0
  );
}

function placeCard(
  spot: SpotlightRect | null,
  cardWidth: number,
  cardHeight: number,
): CardPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), Math.max(min, max));

  if (!spot) {
    return {
      top: Math.max(VIEWPORT_PAD, (vh - cardHeight) / 2),
      left: Math.max(VIEWPORT_PAD, (vw - cardWidth) / 2),
      placement: "center",
    };
  }

  const belowTop = spot.top + spot.height + CARD_GAP;
  const aboveTop = spot.top - cardHeight - CARD_GAP;
  const rightLeft = spot.left + spot.width + CARD_GAP;
  const leftLeft = spot.left - cardWidth - CARD_GAP;

  const fitsBelow = belowTop + cardHeight <= vh - VIEWPORT_PAD;
  const fitsAbove = aboveTop >= VIEWPORT_PAD;
  const fitsRight = rightLeft + cardWidth <= vw - VIEWPORT_PAD;
  const fitsLeft = leftLeft >= VIEWPORT_PAD;

  // Sidebar targets sit on the left — prefer the card in the content gutter.
  const preferRight = spot.left + spot.width < vw * 0.42;

  if (preferRight && fitsRight) {
    return {
      top: clamp(spot.top, VIEWPORT_PAD, vh - cardHeight - VIEWPORT_PAD),
      left: rightLeft,
      placement: "right",
    };
  }
  if (fitsBelow) {
    return {
      top: belowTop,
      left: clamp(
        preferRight ? Math.max(spot.left, rightLeft) : spot.left,
        VIEWPORT_PAD,
        vw - cardWidth - VIEWPORT_PAD,
      ),
      placement: "below",
    };
  }
  if (fitsRight) {
    return {
      top: clamp(spot.top, VIEWPORT_PAD, vh - cardHeight - VIEWPORT_PAD),
      left: rightLeft,
      placement: "right",
    };
  }
  if (fitsAbove) {
    return {
      top: aboveTop,
      left: clamp(spot.left, VIEWPORT_PAD, vw - cardWidth - VIEWPORT_PAD),
      placement: "above",
    };
  }
  if (fitsLeft) {
    return {
      top: clamp(spot.top, VIEWPORT_PAD, vh - cardHeight - VIEWPORT_PAD),
      left: leftLeft,
      placement: "left",
    };
  }

  return {
    top: clamp(
      spot.top + spot.height + CARD_GAP,
      VIEWPORT_PAD,
      vh - cardHeight - VIEWPORT_PAD,
    ),
    left: clamp(
      Math.max(spot.left + spot.width + CARD_GAP, VIEWPORT_PAD),
      VIEWPORT_PAD,
      vw - cardWidth - VIEWPORT_PAD,
    ),
    placement: "below",
  };
}

/**
 * In-app product tour with Whatfix-style spotlight + anchored coach mark.
 */
export function PrismTour(props: PrismTourProps): ReactElement | null {
  const steps = props.steps ?? DEFAULT_STEPS;
  const [index, setIndex] = useState(0);
  const [prevOpen, setPrevOpen] = useState(props.open);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [cardVisible, setCardVisible] = useState(false);
  const [cardPos, setCardPos] = useState<CardPlacement>({
    top: 0,
    left: 0,
    placement: "center",
  });
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const measureAttemptRef = useRef(0);

  // Reset to step 0 synchronously when the tour opens (avoids a one-frame flash).
  if (props.open !== prevOpen) {
    setPrevOpen(props.open);
    if (props.open) {
      setIndex(0);
      setCardVisible(false);
      setSpotlight(null);
    }
  }

  const finish = useCallback(() => {
    markTourCompleted();
    props.onClose();
  }, [props]);

  // Expand / collapse the hover-rail before measuring (layout phase) so nav
  // spotlights aren't locked to a still-collapsed icon strip. In-pane steps
  // omit the attribute so the rail stays collapsed.
  useLayoutEffect(() => {
    if (!props.open) {
      document.documentElement.removeAttribute("data-prism-tour-active");
      return;
    }
    const root = document.documentElement;
    const step = steps[index];
    if (step?.collapseSidebar) {
      root.removeAttribute("data-prism-tour-active");
    } else {
      root.setAttribute("data-prism-tour-active", "true");
    }
    return () => {
      root.removeAttribute("data-prism-tour-active");
    };
  }, [props.open, steps, index]);

  // Navigate shell so the step's target (or screen) is available.
  useEffect(() => {
    if (!props.open) return;
    const step = steps[index];
    if (!step?.navigateTo || !props.onNavigate) return;
    props.onNavigate(step.navigateTo);
  }, [props.open, props.onNavigate, steps, index]);

  const revealCoach = useCallback((usable: SpotlightRect | null) => {
    const card = cardRef.current;
    const cardWidth =
      card?.offsetWidth || Math.min(CARD_WIDTH, window.innerWidth - 32);
    const cardHeight = card?.offsetHeight || 260;
    setSpotlight(usable);
    setCardPos(placeCard(usable, cardWidth, cardHeight));
    setCardVisible(true);
  }, []);

  const measure = useCallback(
    (attempt = 0) => {
      if (!props.open) return;
      const step = steps[index];
      if (!step) return;
      // Prefer the real in-screen target; only fall back after several misses so
      // mid-navigation frames don't lock onto an unrelated sidebar item.
      const el = resolveTarget(step, { allowFallback: attempt >= 3 });
      if (el && "scrollIntoView" in el) {
        try {
          (el as HTMLElement).scrollIntoView({
            block: "nearest",
            inline: "nearest",
          });
        } catch {
          (el as HTMLElement).scrollIntoView(false);
        }
      }
      const spot = el ? readSpotlight(el) : null;
      // Ignore zero-size / offscreen ghosts from mid-unmount frames.
      const usable = spot && isUsableSpotlight(spot) ? spot : null;
      // Hold the coach card + ring hidden until the destination is mounted
      // (or the retry budget is exhausted — then show a centered fallback).
      if (usable || attempt >= MEASURE_RETRY_MS.length - 1) {
        revealCoach(usable);
      }
    },
    [props.open, steps, index, revealCoach],
  );

  useLayoutEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    measureAttemptRef.current = 0;
    // Hide card + spotlight while the next view mounts / is measured.
    setCardVisible(false);
    setSpotlight(null);

    const run = (attempt: number): void => {
      if (cancelled) return;
      measureAttemptRef.current = attempt;
      measure(attempt);
    };

    run(0);
    const rafOuter = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => run(1));
    });
    const timers = MEASURE_RETRY_MS.map((ms, i) =>
      window.setTimeout(() => run(i), ms),
    );

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafOuter);
      for (const t of timers) window.clearTimeout(t);
    };
  }, [props.open, index, measure]);

  useEffect(() => {
    if (!props.open) return;
    const onReposition = (): void => {
      // Only re-place while the coach is visible — avoid flashing mid-nav.
      if (!cardVisible) return;
      measure(measureAttemptRef.current);
    };
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onReposition);
    vv?.addEventListener("scroll", onReposition);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      vv?.removeEventListener("resize", onReposition);
      vv?.removeEventListener("scroll", onReposition);
    };
  }, [props.open, measure, cardVisible]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, finish]);

  useEffect(() => {
    if (!props.open || !cardVisible) return;
    // Prefer focusing the primary action so Esc + Tab stay usable.
    primaryBtnRef.current?.focus();
  }, [props.open, index, cardVisible]);

  if (!props.open || steps.length === 0) return null;
  if (typeof document === "undefined") return null;

  const step = steps[index]!;
  const isFirst = index === 0;
  const isLast = index >= steps.length - 1;
  const anchored = cardVisible && spotlight !== null;

  const cardStyle: CSSProperties = {
    top: cardPos.top,
    left: cardPos.left,
  };

  const ringStyle: CSSProperties | undefined = spotlight
    ? {
        top: spotlight.top,
        left: spotlight.left,
        width: spotlight.width,
        height: spotlight.height,
        borderRadius: spotlight.radius,
      }
    : undefined;

  const tour = (
    <div
      className="prism-tour"
      data-anchored={anchored ? "true" : "false"}
      data-card-visible={cardVisible ? "true" : "false"}
      data-placement={cardPos.placement}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prism-tour-title"
      aria-busy={!cardVisible ? true : undefined}
    >
      <button
        type="button"
        className="prism-tour__mask"
        aria-label="Dismiss tour"
        onClick={finish}
      />

      {cardVisible && spotlight ? (
        <div className="prism-tour__ring" style={ringStyle} aria-hidden />
      ) : null}

      <div
        ref={cardRef}
        className="prism-tour__card"
        style={cardStyle}
        data-placement={cardPos.placement}
        aria-hidden={!cardVisible ? true : undefined}
        inert={!cardVisible ? true : undefined}
      >
        {anchored ? (
          <span
            className="prism-tour__caret"
            data-placement={cardPos.placement}
            aria-hidden
          />
        ) : null}
        <header className="prism-tour__head">
          <span className="prism-tour__badge">
            <Sparkles size={14} strokeWidth={2} aria-hidden />
            Getting started
          </span>
          <button
            type="button"
            className="prism-tour__close"
            aria-label="Skip tour"
            onClick={finish}
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <p className="prism-tour__progress">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="prism-tour-title" className="prism-tour__title">
          {step.title}
        </h2>
        <p className="prism-tour__body">{step.body}</p>

        <div className="prism-tour__dots" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s.id}
              className="prism-tour__dot"
              data-active={i === index ? "true" : "false"}
            />
          ))}
        </div>

        <footer className="prism-tour__foot">
          <button type="button" className="prism-tour__skip" onClick={finish}>
            Skip
          </button>
          <div className="prism-tour__nav">
            <button
              type="button"
              className="prism-tour__btn prism-tour__btn--ghost"
              disabled={isFirst}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              Previous
            </button>
            {isLast ? (
              <button
                ref={primaryBtnRef}
                type="button"
                className="prism-tour__btn prism-tour__btn--primary"
                onClick={finish}
              >
                Done
              </button>
            ) : (
              <button
                ref={primaryBtnRef}
                type="button"
                className="prism-tour__btn prism-tour__btn--primary"
                onClick={() =>
                  setIndex((i) => Math.min(steps.length - 1, i + 1))
                }
              >
                Next
                <ArrowRight size={14} strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );

  // Portal to body so the ring isn't trapped inside screen overflow/stacking
  // contexts (rail, ov-scroll, map wrappers).
  return createPortal(tour, document.body);
}
