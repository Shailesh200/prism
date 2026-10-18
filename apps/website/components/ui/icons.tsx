import type { ComponentProps } from "react";

type IconProps = ComponentProps<"svg">;

const line = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  "aria-hidden": true,
} as const;

export function CopyIcon(props: IconProps) {
  return (
    <svg {...line} {...props}>
      <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
      <path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5H5" />
    </svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <svg {...line} {...props}>
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </svg>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <svg {...line} {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M4.5 6.5l2 1.5-2 1.5M8 10h3.5" />
    </svg>
  );
}

export function GithubIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M8 .9l2.2 4.6 5 .7-3.6 3.5.9 5L8 12.3 3.5 14.7l.9-5L.8 6.2l5-.7z" />
    </svg>
  );
}

const card = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** 20px glyphs for `Card` icons. */
export function ListIcon(props: IconProps) {
  return (
    <svg {...card} {...props}>
      <path d="M7 5.5h10M7 10h10M7 14.5h10" />
      <circle cx="3.5" cy="5.5" r="1" />
      <circle cx="3.5" cy="10" r="1" />
      <circle cx="3.5" cy="14.5" r="1" />
    </svg>
  );
}

export function FlaskIcon(props: IconProps) {
  return (
    <svg {...card} {...props}>
      <path d="M7.5 2.5h5M8.5 2.5v5l-4.5 8a1.5 1.5 0 0 0 1.3 2h9.4a1.5 1.5 0 0 0 1.3-2l-4.5-8v-5" />
      <path d="M6 12.5h8" />
    </svg>
  );
}

export function SpokesIcon(props: IconProps) {
  return (
    <svg {...card} {...props}>
      <path d="M10 2.5v4M10 13.5v4M2.5 10h4M13.5 10h4M5 5l2.5 2.5M12.5 12.5L15 15M15 5l-2.5 2.5M7.5 12.5L5 15" />
    </svg>
  );
}

export function BranchIcon(props: IconProps) {
  return (
    <svg {...card} {...props}>
      <circle cx="6" cy="4.5" r="2" />
      <circle cx="6" cy="15.5" r="2" />
      <circle cx="14" cy="8" r="2" />
      <path d="M6 6.5v7M14 10c0 3-8 2-8 3.5" />
    </svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <svg {...card} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="10" cy="10" r="4" />
      <circle cx="10" cy="10" r="1" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...card} {...props}>
      <path d="M10 2.5l6.5 2.5v5c0 4-3 6.5-6.5 7.5-3.5-1-6.5-3.5-6.5-7.5V5z" />
      <path d="M7 10l2 2 4-4" />
    </svg>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <svg {...card} {...props}>
      <path d="M10 2.5l7.5 4-7.5 4-7.5-4z" />
      <path d="M2.5 10.5l7.5 4 7.5-4M2.5 14l7.5 4 7.5-4" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...card} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M6.5 10.2l2.4 2.4 4.6-5" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden
      {...props}
    >
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5M10 6.2v.1" />
    </svg>
  );
}
