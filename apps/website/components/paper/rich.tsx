import Link from "next/link";
import type { ReactNode } from "react";

/** Inline `code` and [label](href) in design copy. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={index}>{part.slice(1, -1)}</code>;
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          const href = link[2] ?? "";
          if (href.startsWith("/")) {
            return (
              <Link key={index} href={href}>
                <u>{link[1]}</u>
              </Link>
            );
          }
          return (
            <a key={index} href={href}>
              <u>{link[1]}</u>
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function RichBlock({ text }: { text: string }) {
  return (
    <p>
      <Rich text={text} />
    </p>
  );
}

export function EmTitle({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("*") && part.endsWith("*") ? (
          <em key={index}>{part.slice(1, -1)}</em>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
