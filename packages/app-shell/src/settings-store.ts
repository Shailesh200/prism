/**
 * Portable Prism settings (playground + IDE webview).
 * Persisted in localStorage under `prism.settings.v1`.
 */

export type PrismTheme = "light" | "dark" | "system";
export type PrismDensity = "comfortable" | "compact";
export type MaxFileSizeOption = "256kb" | "1mb" | "5mb" | "10mb" | "none";
export type PrismMonoFont = "jetbrains" | "ibm-plex" | "fira" | "system";
export type PrismSansFont = "inter" | "ibm-plex" | "system";
/** Auto Re-Index debounce interval identifiers (5m … 6h). */
export type AutoReindexInterval = "5m" | "15m" | "30m" | "1h" | "3h" | "6h";

export type PrismSettingsV1 = {
  readonly displayName: string;
  readonly autoReindex: boolean;
  /** Debounce window applied before an auto re-index fires. */
  readonly autoReindexInterval: AutoReindexInterval;
  /** Newline-separated gitignore-style exclude globs. */
  readonly excludeGlobs: string;
  readonly maxFileSize: MaxFileSizeOption;
  readonly theme: PrismTheme;
  readonly density: PrismDensity;
  /** App-wide monospace font family. */
  readonly monoFont: PrismMonoFont;
  /** App-wide sans font family. */
  readonly sansFont: PrismSansFont;
  readonly telemetry: boolean;
  /** Core analysis stays on-device. Disabling requires an explicit warning. */
  readonly localOnlyAnalysis: boolean;
  /**
   * Legacy master network switch, superseded by Core's consent purposes
   * (M-036). Kept only so the one-time migration in `consent-state.ts` can
   * read the user's prior intent; nothing consults it to decide anything.
   */
  readonly allowNetworkIntegrations: boolean;
  /** ISO timestamp of that migration, or empty if it has not run. */
  readonly consentMigratedAt: string;
};

export const SETTINGS_STORAGE_KEY = "prism.settings.v1";

/** Sensible default exclude globs applied when the user hasn't set any. */
export const DEFAULT_EXCLUDE_GLOBS: readonly string[] = [
  "node_modules/**",
  "dist/**",
  "build/**",
  ".next/**",
  "out/**",
  "coverage/**",
  ".git/**",
  ".turbo/**",
  ".cache/**",
  "**/*.min.js",
  "**/*.map",
];

/**
 * Repo-type aware default exclude globs. Extends the base list with a few
 * ecosystem-specific folders so the first index skips obvious noise.
 */
export function defaultExcludeGlobs(
  repoType?: "node" | "python" | "rust" | "go" | "unknown",
): string {
  const extra: Record<string, readonly string[]> = {
    python: ["__pycache__/**", ".venv/**", "venv/**", "*.pyc"],
    rust: ["target/**"],
    go: ["vendor/**", "bin/**"],
    node: [".pnpm-store/**"],
    unknown: [],
  };
  const globs = [
    ...DEFAULT_EXCLUDE_GLOBS,
    ...(repoType ? (extra[repoType] ?? []) : []),
  ];
  return globs.join("\n");
}

export const DEFAULT_SETTINGS: PrismSettingsV1 = {
  displayName: "",
  autoReindex: false,
  autoReindexInterval: "15m",
  excludeGlobs: "",
  maxFileSize: "5mb",
  theme: "dark",
  density: "comfortable",
  monoFont: "jetbrains",
  sansFont: "inter",
  telemetry: false,
  localOnlyAnalysis: true,
  allowNetworkIntegrations: false,
  consentMigratedAt: "",
};

export const MAX_FILE_SIZE_OPTIONS: readonly {
  value: MaxFileSizeOption;
  label: string;
}[] = [
  { value: "256kb", label: "256 KB" },
  { value: "1mb", label: "1 MB" },
  { value: "5mb", label: "5 MB" },
  { value: "10mb", label: "10 MB" },
  { value: "none", label: "No limit" },
];

/** Auto Re-Index debounce options with their millisecond values. */
export const AUTO_REINDEX_INTERVAL_OPTIONS: readonly {
  value: AutoReindexInterval;
  label: string;
  ms: number;
}[] = [
  { value: "5m", label: "5 minutes", ms: 5 * 60_000 },
  { value: "15m", label: "15 minutes", ms: 15 * 60_000 },
  { value: "30m", label: "30 minutes", ms: 30 * 60_000 },
  { value: "1h", label: "1 hour", ms: 60 * 60_000 },
  { value: "3h", label: "3 hours", ms: 3 * 60 * 60_000 },
  { value: "6h", label: "6 hours", ms: 6 * 60 * 60_000 },
];

/** Resolve an interval id to its debounce value in milliseconds. */
export function autoReindexIntervalMs(interval: AutoReindexInterval): number {
  const match = AUTO_REINDEX_INTERVAL_OPTIONS.find((o) => o.value === interval);
  return match?.ms ?? 15 * 60_000;
}

/** Mono font options; `stack` renders each label in its own family. */
export const MONO_FONT_OPTIONS: readonly {
  value: PrismMonoFont;
  label: string;
  stack: string;
}[] = [
  {
    value: "jetbrains",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono", ui-monospace, monospace',
  },
  {
    value: "ibm-plex",
    label: "IBM Plex Mono",
    stack: '"IBM Plex Mono", ui-monospace, monospace',
  },
  {
    value: "fira",
    label: "Fira Code",
    stack: '"Fira Code", "Fira Mono", ui-monospace, monospace',
  },
  {
    value: "system",
    label: "System",
    stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
];

/** Sans font options; `stack` renders each label in its own family. */
export const SANS_FONT_OPTIONS: readonly {
  value: PrismSansFont;
  label: string;
  stack: string;
}[] = [
  {
    value: "inter",
    label: "Inter",
    stack: '"Inter", "Segoe UI", system-ui, sans-serif',
  },
  {
    value: "ibm-plex",
    label: "IBM Plex Sans",
    stack: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
  },
  {
    value: "system",
    label: "System",
    stack: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
];

function isTheme(v: unknown): v is PrismTheme {
  return v === "light" || v === "dark" || v === "system";
}

function isDensity(v: unknown): v is PrismDensity {
  return v === "comfortable" || v === "compact";
}

function isMaxFileSize(v: unknown): v is MaxFileSizeOption {
  return (
    v === "256kb" || v === "1mb" || v === "5mb" || v === "10mb" || v === "none"
  );
}

function isMonoFont(v: unknown): v is PrismMonoFont {
  return (
    v === "jetbrains" || v === "ibm-plex" || v === "fira" || v === "system"
  );
}

function isSansFont(v: unknown): v is PrismSansFont {
  return v === "inter" || v === "ibm-plex" || v === "system";
}

function isAutoReindexInterval(v: unknown): v is AutoReindexInterval {
  return (
    v === "5m" ||
    v === "15m" ||
    v === "30m" ||
    v === "1h" ||
    v === "3h" ||
    v === "6h"
  );
}

export function loadSettings(): PrismSettingsV1 {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PrismSettingsV1>;
    const maxFileSize = isMaxFileSize(parsed.maxFileSize)
      ? parsed.maxFileSize
      : DEFAULT_SETTINGS.maxFileSize;
    const autoReindex =
      maxFileSize === "none"
        ? false
        : typeof parsed.autoReindex === "boolean"
          ? parsed.autoReindex
          : DEFAULT_SETTINGS.autoReindex;
    return {
      displayName:
        typeof parsed.displayName === "string"
          ? parsed.displayName
          : DEFAULT_SETTINGS.displayName,
      autoReindex,
      autoReindexInterval: isAutoReindexInterval(parsed.autoReindexInterval)
        ? parsed.autoReindexInterval
        : DEFAULT_SETTINGS.autoReindexInterval,
      excludeGlobs:
        typeof parsed.excludeGlobs === "string"
          ? parsed.excludeGlobs
          : DEFAULT_SETTINGS.excludeGlobs,
      maxFileSize,
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      density: isDensity(parsed.density)
        ? parsed.density
        : DEFAULT_SETTINGS.density,
      monoFont: isMonoFont(parsed.monoFont)
        ? parsed.monoFont
        : DEFAULT_SETTINGS.monoFont,
      sansFont: isSansFont(parsed.sansFont)
        ? parsed.sansFont
        : DEFAULT_SETTINGS.sansFont,
      telemetry:
        typeof parsed.telemetry === "boolean"
          ? parsed.telemetry
          : DEFAULT_SETTINGS.telemetry,
      localOnlyAnalysis:
        typeof parsed.localOnlyAnalysis === "boolean"
          ? parsed.localOnlyAnalysis
          : DEFAULT_SETTINGS.localOnlyAnalysis,
      allowNetworkIntegrations:
        typeof parsed.allowNetworkIntegrations === "boolean"
          ? parsed.allowNetworkIntegrations
          : DEFAULT_SETTINGS.allowNetworkIntegrations,
      consentMigratedAt:
        typeof parsed.consentMigratedAt === "string"
          ? parsed.consentMigratedAt
          : DEFAULT_SETTINGS.consentMigratedAt,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<PrismSettingsV1>): PrismSettingsV1 {
  const prev = loadSettings();
  let next: PrismSettingsV1 = { ...prev, ...patch };
  if (next.maxFileSize === "none") {
    next = { ...next, autoReindex: false };
  }
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

/**
 * Apply theme + density + font-family attributes so tokens and `.ov`/
 * `.prism-theme` roots respond across the whole app (not just a few inputs).
 */
export function applyAppearance(settings: {
  theme: PrismTheme;
  density: PrismDensity;
  monoFont?: PrismMonoFont;
  sansFont?: PrismSansFont;
}): void {
  const { theme, density, monoFont, sansFont } = settings;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.prismDensity = density;
  root.dataset.density = density;
  if (monoFont) root.dataset.prismMonoFont = monoFont;
  if (sansFont) root.dataset.prismSansFont = sansFont;

  const body = document.body;
  if (body) {
    body.setAttribute("data-theme", theme);
    body.setAttribute("data-density", density);
    body.setAttribute("data-prism-density", density);
    if (monoFont) body.setAttribute("data-prism-mono-font", monoFont);
    if (sansFont) body.setAttribute("data-prism-sans-font", sansFont);
    if (!body.classList.contains("prism-theme")) {
      body.classList.add("prism-theme");
    }
  }

  for (const el of document.querySelectorAll(".prism-theme")) {
    el.setAttribute("data-theme", theme);
    el.setAttribute("data-density", density);
    if (monoFont) el.setAttribute("data-prism-mono-font", monoFont);
    if (sansFont) el.setAttribute("data-prism-sans-font", sansFont);
  }
  for (const el of document.querySelectorAll(".ov")) {
    el.setAttribute("data-density", density);
    el.setAttribute("data-prism-density", density);
  }
}

/** Parse exclude textarea into trimmed non-empty globs. */
export function parseExcludeGlobs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
