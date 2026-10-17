import Link from "next/link";

/** The supplied horizontal lockup (mark + wordmark) is 140.83 × 30. */
const RATIO = 140.83 / 30;

/**
 * Prism's horizontal lockup as one SVG, so the mark and the wordmark stay
 * aligned. `tone="dark"` is the paper/teal version for carbon backgrounds.
 */
export function Logo({
  size = 26,
  tone = "light",
}: {
  size?: number;
  tone?: "light" | "dark";
}) {
  return (
    <Link href="/" aria-label="Prism home" className="logo">
      {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG needs no optimizer */}
      <img
        src={`/brand/prism-horizontal-${tone}.svg`}
        alt="Prism"
        width={Math.round(size * RATIO)}
        height={size}
      />
    </Link>
  );
}
