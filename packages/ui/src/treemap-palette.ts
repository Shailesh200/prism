import { resolveFileType, type FileTypeInfo } from "./file-type.js";

/**
 * Treemap fills derived from Prism Signal Chart tokens (plans/mockups/DESIGN.md).
 * One teal accent family — no purple / neon.
 */
export const TREEMAP_SHADES = {
  panel: "#FBFCFD",
  tile: "#F3F7F9",
  canvas: "#E8EEF2",
  nodeFill: "#F7FAFB",
  mist: "#D5E3E8",
  aquaSoft: "#C5E0DC",
  aqua: "#9FCFC8",
  tealSoft: "#6BB5AC",
  brand: "#0F766E",
  brandStrong: "#115E59",
  ink: "#0F1C24",
  inkMuted: "#5A6B76",
  line: "#C5D0D8",
  onBrand: "#FFFFFF",
  safe: "#059669",
} as const;

/** Size legend stops for folders — canvas mist → brand strong. */
export const TREEMAP_COLOR_STOPS: ReadonlyArray<[number, string]> = [
  [0, TREEMAP_SHADES.tile],
  [0.12, TREEMAP_SHADES.canvas],
  [0.28, TREEMAP_SHADES.aquaSoft],
  [0.48, TREEMAP_SHADES.aqua],
  [0.68, TREEMAP_SHADES.tealSoft],
  [0.86, TREEMAP_SHADES.brand],
  [1, TREEMAP_SHADES.brandStrong],
];

/**
 * Distinct fills per file-type tone (still in Signal Chart teal/slate family).
 * Saturated enough to read apart at a glance on the map.
 */
export const FILE_TYPE_FILLS: Record<FileTypeInfo["tone"], string> = {
  ts: "#0F766E",
  js: "#6BB5AC",
  json: "#A8B5BF",
  css: "#5B9EA8",
  md: "#D0D8DE",
  config: "#8A97A1",
  test: "#059669",
  code: "#148F85",
  other: "#C5D0D8",
};

/** Compact legend chips for the density chrome. */
export const FILE_TYPE_LEGEND: ReadonlyArray<{
  tone: FileTypeInfo["tone"] | "folder";
  label: string;
  color: string;
}> = [
  { tone: "folder", label: "Folder", color: TREEMAP_SHADES.brand },
  { tone: "ts", label: "TS", color: FILE_TYPE_FILLS.ts },
  { tone: "js", label: "JS", color: FILE_TYPE_FILLS.js },
  { tone: "json", label: "JSON", color: FILE_TYPE_FILLS.json },
  { tone: "css", label: "CSS", color: FILE_TYPE_FILLS.css },
  { tone: "md", label: "MD", color: FILE_TYPE_FILLS.md },
  { tone: "config", label: "Config", color: FILE_TYPE_FILLS.config },
  { tone: "test", label: "Test", color: FILE_TYPE_FILLS.test },
  { tone: "code", label: "Code", color: FILE_TYPE_FILLS.code },
];

const SIBLING_ACCENTS = [
  TREEMAP_SHADES.brand,
  TREEMAP_SHADES.tealSoft,
  TREEMAP_SHADES.safe,
  TREEMAP_SHADES.aqua,
  TREEMAP_SHADES.brandStrong,
  "#148F85",
  "#3D9B90",
  "#0D6B64",
] as const;

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const u = clamp01(t);
  return rgbToHex(ar + (br - ar) * u, ag + (bg - ag) * u, ab + (bb - ab) * u);
}

function sampleStops(t: number): string {
  const x = clamp01(t);
  for (let i = 0; i < TREEMAP_COLOR_STOPS.length - 1; i++) {
    const [t0, c0] = TREEMAP_COLOR_STOPS[i]!;
    const [t1, c1] = TREEMAP_COLOR_STOPS[i + 1]!;
    if (x <= t1) {
      const local = (x - t0) / (t1 - t0 || 1);
      return mix(c0, c1, local);
    }
  }
  return TREEMAP_SHADES.brandStrong;
}

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export type PalettePointInput = {
  readonly id: string;
  readonly kind: "folder" | "file" | "symbol";
  readonly fileCount: number;
  readonly value?: number;
  readonly path?: string;
  readonly name?: string;
};

export type PaletteExtras = {
  color: string;
  colorValue: number;
  fileTone?: FileTypeInfo["tone"];
  fileLabel?: string;
};

/**
 * Assign fill colors from the design-system palette.
 * Folders: size-weighted teal. Files: distinct shade per file type.
 */
export function colorizeTreemapPoints<T extends PalettePointInput>(
  points: readonly T[],
): Array<T & PaletteExtras> {
  const maxFolder = Math.max(
    1,
    ...points.filter((p) => p.kind === "folder").map((p) => p.fileCount),
  );

  return points.map((point, index) => {
    if (point.kind === "folder") {
      const sizeT = clamp01(Math.sqrt(point.fileCount / maxFolder));
      const accent =
        SIBLING_ACCENTS[(hashHue(point.id) + index) % SIBLING_ACCENTS.length]!;
      const base = sampleStops(0.35 + sizeT * 0.65);
      const color = mix(base, accent, 0.16 + sizeT * 0.1);
      return { ...point, color, colorValue: point.fileCount };
    }

    const type = resolveFileType(point.path || point.name || point.id);
    const base = FILE_TYPE_FILLS[type.tone];
    // Tiny per-file jitter so adjacent same-type tiles aren’t identical.
    const jitter = ((hashHue(point.id) % 9) - 4) / 100;
    const color = mix(
      base,
      jitter >= 0 ? TREEMAP_SHADES.panel : TREEMAP_SHADES.brandStrong,
      Math.abs(jitter),
    );
    return {
      ...point,
      color,
      colorValue: point.value ?? 1,
      fileTone: type.tone,
      fileLabel: type.label,
    };
  });
}

export function labelInkForFill(fill: string): string {
  const [r, g, b] = hexToRgb(fill);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma < 0.55 ? TREEMAP_SHADES.onBrand : TREEMAP_SHADES.ink;
}
