"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DOC_GROUPS,
  DOCS,
  docHref,
  docSearch,
  type DocPage,
} from "@/lib/paper/docs-content";

export function DocsChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <>
      <div className="docs">
        <aside className="side">
          <button
            type="button"
            className="search"
            onClick={() => setOpen(true)}
          >
            <span aria-hidden="true">⌕</span>
            <span>Search docs</span>
            <kbd>⌘K</kbd>
          </button>
          {DOC_GROUPS.map((group) => (
            <div key={group}>
              <h2>{group}</h2>
              {DOCS.filter((page) => page.group === group).map((page) => {
                const href = docHref(page.slug);
                const on = path === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={on ? "on" : undefined}
                    aria-current={on ? "page" : undefined}
                  >
                    {page.title}
                  </Link>
                );
              })}
            </div>
          ))}
        </aside>
        {children}
      </div>
      {open ? <DocSearch onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DocSearch({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const hits = useMemo(() => docSearch(query), [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function go(page: DocPage | undefined) {
    if (!page) return;
    router.push(docHref(page.slug));
    onClose();
  }

  return (
    <div className="search-modal" onMouseDown={onClose}>
      <div
        className="search-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <span id={titleId} className="sr-only">
            Search docs
          </span>
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search docs"
            aria-label="Search docs"
            aria-controls="doc-search-hits"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) =>
                  Math.min(value + 1, Math.max(hits.length - 1, 0)),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(hits[active]);
              }
            }}
          />
          <button type="button" onClick={onClose} aria-label="Close search">
            <kbd>esc</kbd>
          </button>
        </div>
        <div
          id="doc-search-hits"
          role="listbox"
          aria-label="Search results"
          style={{ overflow: "auto", padding: 8 }}
        >
          {hits.length === 0 ? (
            <p style={{ padding: "14px 18px", color: "var(--ink3)" }}>
              No matching pages.
            </p>
          ) : (
            hits.map((hit, index) => (
              <Link
                key={docHref(hit.slug)}
                href={docHref(hit.slug)}
                role="option"
                aria-selected={index === active}
                className={`search-hit${index === active ? " on" : ""}`}
                onMouseEnter={() => setActive(index)}
              >
                <b>{hit.title}</b>
                <span
                  style={{
                    display: "block",
                    color: "var(--ink3)",
                    fontSize: 14,
                  }}
                >
                  {hit.description}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
