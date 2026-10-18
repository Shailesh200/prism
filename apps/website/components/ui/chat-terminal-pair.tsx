"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChatIcon, TerminalIcon } from "./icons";

const TABS = [
  { label: "Agent chat", icon: <ChatIcon /> },
  { label: "Terminal", icon: <TerminalIcon /> },
] as const;

/**
 * Number the rows of each window body (`--i`) for the staggered reveal. A
 * typed first command takes two slots, as in the design.
 */
function numberRows(root: HTMLElement) {
  for (const body of root.querySelectorAll<HTMLElement>(".vis .body")) {
    let i = 0;
    for (const row of body.children) {
      (row as HTMLElement).style.setProperty("--i", String(i));
      i += i === 0 && row.querySelector(".typed") ? 2 : 1;
    }
  }
}

/** Restart a pane's reveal (the design replays it when you switch tabs). */
function replay(pane: HTMLElement | null) {
  for (const vis of pane?.querySelectorAll<HTMLElement>(".vis") ?? []) {
    vis.classList.remove("play");
    void vis.offsetWidth;
    vis.classList.add("play");
  }
}

/**
 * Agent chat / terminal tabs. The rows rise in one by one and the first
 * command types itself the first time the pair scrolls into view; switching
 * tabs replays the new pane. With reduced motion the final state shows.
 */
export function ChatTerminalPair({
  chat,
  terminal,
}: {
  chat: ReactNode;
  terminal: ReactNode;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const panes = useRef<Array<HTMLDivElement | null>>([]);
  const [active, setActive] = useState(0);
  /** False until we know motion is allowed: then the rows show as they are. */
  const [animate, setAnimate] = useState<boolean | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setAnimate(false);
      return;
    }
    numberRows(el);
    setAnimate(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        for (const vis of el.querySelectorAll(".vis")) {
          vis.classList.add("play");
        }
        io.disconnect();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function select(i: number, focus = false) {
    if (i !== active) {
      setActive(i);
      if (animate) replay(panes.current[i]);
    }
    if (focus) tabs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const last = TABS.length - 1;
    const next =
      e.key === "ArrowRight"
        ? active === last
          ? 0
          : active + 1
        : e.key === "ArrowLeft"
          ? active === 0
            ? last
            : active - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    select(next, true);
  }

  return (
    <div
      ref={root}
      className="pair"
      data-static={animate === false || undefined}
    >
      <div
        className="tabs"
        role="tablist"
        aria-label="Show as"
        onKeyDown={onKeyDown}
      >
        {TABS.map((tab, i) => (
          <button
            key={tab.label}
            ref={(b) => {
              tabs.current[i] = b;
            }}
            type="button"
            role="tab"
            id={`${id}-tab${i}`}
            aria-controls={`${id}-pane${i}`}
            aria-selected={active === i}
            tabIndex={active === i ? 0 : -1}
            onClick={() => select(i)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="panes">
        {[chat, terminal].map((content, i) => (
          <div
            key={TABS[i].label}
            ref={(p) => {
              panes.current[i] = p;
            }}
            className="pane"
            role="tabpanel"
            id={`${id}-pane${i}`}
            aria-labelledby={`${id}-tab${i}`}
            data-on={active === i || undefined}
            inert={active !== i}
          >
            {content}
          </div>
        ))}
      </div>
    </div>
  );
}
