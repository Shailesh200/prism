import type { CSSProperties } from "react";

type LogoProps = {
  variant?: "lockup" | "docs";
  height?: number;
  className?: string;
};

const SRC = {
  lockup: "/brand/horizontal-light.svg",
  docs: "/brand/docs-header-light.svg",
} as const;

/** Prompt lockup. The SVG already contains the wordmark, so no extra text. */
export function Logo({
  variant = "lockup",
  height = 28,
  className,
}: LogoProps) {
  const src = SRC[variant];
  const style: CSSProperties = { height, width: "auto" };
  return (
    // The lockup is the accessible name; decorative mark paths are inside the file.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Prism"
      style={style}
      className={className ?? "logo-img"}
    />
  );
}
