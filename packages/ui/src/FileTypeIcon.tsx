import type { ReactElement } from "react";
import type { FileTypeInfo } from "./file-type.js";

type Props = {
  readonly tone: FileTypeInfo["tone"];
  readonly badge: string;
  readonly size?: number;
};

type IconKey =
  | "ts"
  | "tsx"
  | "js"
  | "jsx"
  | "json"
  | "css"
  | "md"
  | "test"
  | "config"
  | "code"
  | "other";

function iconKey(tone: FileTypeInfo["tone"], badge: string): IconKey {
  if (tone === "ts" && badge === "TSX") return "tsx";
  if (tone === "js" && badge === "JSX") return "jsx";
  if (
    tone === "ts" ||
    tone === "js" ||
    tone === "json" ||
    tone === "css" ||
    tone === "md" ||
    tone === "test" ||
    tone === "config" ||
    tone === "code"
  ) {
    return tone;
  }
  return "other";
}

/** Generated IDE-style file icons (no external spritesheet required). */
export function FileTypeIcon(props: Props): ReactElement {
  const size = props.size ?? 22;
  const key = iconKey(props.tone, props.badge);
  return (
    <svg
      className="prism-file-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      {ICONS[key]}
    </svg>
  );
}

const ICONS: Record<IconKey, ReactElement> = {
  ts: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#3178C6" />
      <path
        d="M6.2 8.2h11.6M12 8.2V17"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14.2 17c.7.7 1.6 1.05 2.6 1.05 1.35 0 2.3-.7 2.3-1.75 0-1.05-.7-1.55-2.2-1.95l-.7-.2c-.85-.25-1.2-.5-1.2-.95 0-.45.4-.8 1.05-.8.65 0 1.2.25 1.7.75"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  tsx: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#3178C6" />
      <path
        d="M5.8 8h7.2M9.4 8v8.4"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M15.2 11.2 18.6 17M18.6 11.2 15.2 17"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </>
  ),
  js: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#F0DB4F" />
      <path
        d="M9.2 7.8v7.2c0 1.5-.7 2.2-2 2.2-.7 0-1.3-.25-1.75-.7"
        stroke="#323330"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12.2 12.4c.35-.55.95-.9 1.75-.9 1.15 0 1.9.65 1.9 1.85 0 1.55-1.55 2-1.55 2s1.7.35 1.7 2.05c0 1.3-.95 2.1-2.25 2.1-.9 0-1.6-.35-2.05-1"
        stroke="#323330"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </>
  ),
  jsx: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#F0DB4F" />
      <path
        d="M7.2 8.2v6.4c0 1.2-.55 1.8-1.55 1.8"
        stroke="#323330"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M11.4 12.2c.3-.5.8-.8 1.45-.8.95 0 1.55.55 1.55 1.55 0 1.3-1.25 1.65-1.25 1.65s1.35.3 1.35 1.7c0 1.05-.75 1.7-1.8 1.7-.7 0-1.25-.25-1.65-.8"
        stroke="#323330"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <path
        d="M17.2 10.8 19.6 15.4M19.6 10.8 17.2 15.4"
        stroke="#323330"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    </>
  ),
  json: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#CBCB41" />
      <path
        d="M9 7.5c-1.4 0-2.2 1-2.2 2.2v1.1c0 .7-.45 1.15-1.1 1.2.65.05 1.1.5 1.1 1.2v1.1c0 1.2.8 2.2 2.2 2.2"
        stroke="#1E1E1E"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <path
        d="M15 7.5c1.4 0 2.2 1 2.2 2.2v1.1c0 .7.45 1.15 1.1 1.2-.65.05-1.1.5-1.1 1.2v1.1c0 1.2-.8 2.2-2.2 2.2"
        stroke="#1E1E1E"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    </>
  ),
  css: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#264DE4" />
      <path
        d="M7.2 7.5h9.6l-.9 9.2L12 18.6l-3.9-1.9-.5-5.4h2.2l.25 2.9L12 15l2.1-.95.45-4.55H7.55"
        fill="#fff"
      />
    </>
  ),
  md: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#5A6B76" />
      <path
        d="M6 16.5V7.5h2.4L12 12.2 15.6 7.5H18v9"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  test: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#0F766E" />
      <path
        d="M8.2 6.5h7.6v2.2L13.4 13v3.4l-1.4 1.1-1.4-1.1V13L8.2 8.7V6.5Z"
        stroke="#fff"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
    </>
  ),
  config: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#6B7280" />
      <circle cx="12" cy="12" r="2.4" stroke="#fff" strokeWidth="1.5" />
      <path
        d="M12 6.2v1.5M12 16.3v1.5M6.2 12h1.5M16.3 12h1.5M7.7 7.7l1.1 1.1M15.2 15.2l1.1 1.1M16.3 7.7l-1.1 1.1M8.8 15.2l-1.1 1.1"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  code: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#115E59" />
      <path
        d="M9.2 8.2 6.4 12l2.8 3.8M14.8 8.2 17.6 12l-2.8 3.8"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  other: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#5A6B76" />
      <path
        d="M8 5.5h5.2L16.5 9v9.5H8V5.5Z"
        stroke="#fff"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 5.5V9H16.5"
        stroke="#fff"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
    </>
  ),
};
