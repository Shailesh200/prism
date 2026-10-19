"use client";

import { useSearchContext } from "fumadocs-ui/contexts/search";
import { useTreePath } from "fumadocs-ui/contexts/tree";
import { SidebarTrigger } from "fumadocs-ui/layouts/notebook/slots/sidebar";
import Link from "next/link";
import type { ComponentProps } from "react";

export function DocsSearchPill() {
  const { enabled, hotKey, setOpenSearch } = useSearchContext();
  if (!enabled) return null;
  const keys = hotKey.map((key, i) => <span key={i}>{key.display}</span>);
  return (
    <button
      type="button"
      className="docs-search"
      onClick={() => setOpenSearch(true)}
    >
      <span aria-hidden="true">⌕</span>
      Search docs
      <kbd>{keys.length > 0 ? keys : "⌘K"}</kbd>
    </button>
  );
}

/** Sidebar header: the search pill. Drawer children (the close button) stay. */
export function DocsSidebarBanner(props: ComponentProps<"div">) {
  return (
    <div {...props} className={`docs-side-banner ${props.className ?? ""}`}>
      <DocsSearchPill />
      {props.children}
    </div>
  );
}

/** Opens the docs drawer on a narrow screen. Hidden from the desktop grid. */
export function DocsMobileBar() {
  return (
    <header className="docs-mobile-bar">
      <SidebarTrigger className="docs-menu" aria-label="Docs menu">
        Docs
      </SidebarTrigger>
      <DocsSearchPill />
    </header>
  );
}

/** `Docs / <section>` from the page tree, above the article title. */
export function DocsCrumb() {
  const path = useTreePath();
  const section = path
    .toReversed()
    .find((node) => node.type === "separator" || node.type === "folder");
  const name =
    section && "name" in section && section.name ? String(section.name) : null;
  return (
    <p className="docs-crumb">
      <Link href="/docs">Docs</Link>
      {name ? <span> / {name}</span> : null}
    </p>
  );
}
