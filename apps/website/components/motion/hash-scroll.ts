"use client";

import { ensureGsap, prefersReducedMotion } from "@/lib/gsap";

/** Height of anything sticky at the top, so a target does not land under it. */
const HEADER_OFFSET = 80;

/**
 * Scroll to an element by id.
 *
 * Falls back to an instant jump under reduced motion — and that is the whole
 * point of the preference here. A smooth scroll is not decoration for someone
 * with a vestibular disorder; a long page glide is one of the specific things
 * `prefers-reduced-motion` exists to stop.
 *
 * Returns whether the target existed, so a caller can leave a bad link to the
 * browser rather than swallowing it.
 */
export function scrollToId(id: string): boolean {
  const target = document.getElementById(id);
  if (!target) return false;

  const y = target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;

  if (prefersReducedMotion()) {
    window.scrollTo(0, y);
    return true;
  }

  ensureGsap().to(window, {
    scrollTo: { y, autoKill: true },
    duration: 0.7,
    ease: "power2.inOut",
  });
  return true;
}

/**
 * Intercept same-page hash links so they animate instead of jumping.
 *
 * Delegated from the document rather than bound per link: anchors inside
 * rendered MDX appear and disappear as routes change, and a per-link listener
 * would need re-binding on every one of them.
 *
 * Returns a teardown. Modified clicks (new tab, download, right button) are
 * left entirely alone — overriding those breaks behaviour the user asked for.
 */
export function installHashScroll(): () => void {
  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented) return;
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    const link = (event.target as Element | null)?.closest("a");
    const href = link?.getAttribute("href");
    if (!link || !href?.startsWith("#") || href.length < 2) return;
    if (link.target === "_blank") return;

    const id = decodeURIComponent(href.slice(1));
    if (!scrollToId(id)) return;

    event.preventDefault();
    // Kept in the URL so the link stays copyable and Back still works, but
    // without the browser's own jump that `location.hash =` would trigger.
    history.pushState(null, "", href);
  };

  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
