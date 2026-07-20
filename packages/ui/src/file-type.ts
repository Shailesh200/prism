export type FileTypeInfo = {
  /** Short badge in the chip (TS, JS, MD…). */
  readonly badge: string;
  /** Human label for the inspector / chip. */
  readonly label: string;
  /** Stable token for CSS accent. */
  readonly tone:
    | "ts"
    | "js"
    | "json"
    | "css"
    | "md"
    | "config"
    | "test"
    | "code"
    | "other";
};

const EXT_MAP: Record<string, FileTypeInfo> = {
  ts: { badge: "TS", label: "TypeScript", tone: "ts" },
  tsx: { badge: "TSX", label: "TSX", tone: "ts" },
  mts: { badge: "TS", label: "TypeScript", tone: "ts" },
  cts: { badge: "TS", label: "TypeScript", tone: "ts" },
  js: { badge: "JS", label: "JavaScript", tone: "js" },
  jsx: { badge: "JSX", label: "JSX", tone: "js" },
  mjs: { badge: "JS", label: "JavaScript", tone: "js" },
  cjs: { badge: "JS", label: "JavaScript", tone: "js" },
  json: { badge: "{}", label: "JSON", tone: "json" },
  css: { badge: "CSS", label: "CSS", tone: "css" },
  scss: { badge: "SCSS", label: "SCSS", tone: "css" },
  less: { badge: "LESS", label: "Less", tone: "css" },
  md: { badge: "MD", label: "Markdown", tone: "md" },
  mdx: { badge: "MDX", label: "MDX", tone: "md" },
  html: { badge: "HTML", label: "HTML", tone: "code" },
  svg: { badge: "SVG", label: "SVG", tone: "code" },
  yaml: { badge: "YML", label: "YAML", tone: "config" },
  yml: { badge: "YML", label: "YAML", tone: "config" },
  toml: { badge: "TOML", label: "TOML", tone: "config" },
  graphql: { badge: "GQL", label: "GraphQL", tone: "code" },
  gql: { badge: "GQL", label: "GraphQL", tone: "code" },
  py: { badge: "PY", label: "Python", tone: "code" },
  go: { badge: "GO", label: "Go", tone: "code" },
  rs: { badge: "RS", label: "Rust", tone: "code" },
  java: { badge: "JAVA", label: "Java", tone: "code" },
  kt: { badge: "KT", label: "Kotlin", tone: "code" },
  rb: { badge: "RB", label: "Ruby", tone: "code" },
  php: { badge: "PHP", label: "PHP", tone: "code" },
  sql: { badge: "SQL", label: "SQL", tone: "code" },
  sh: { badge: "SH", label: "Shell", tone: "config" },
  bash: { badge: "SH", label: "Shell", tone: "config" },
  zsh: { badge: "SH", label: "Shell", tone: "config" },
};

const NAME_MAP: Record<string, FileTypeInfo> = {
  "package.json": { badge: "PKG", label: "Package", tone: "config" },
  "tsconfig.json": { badge: "CFG", label: "TS config", tone: "config" },
  "bun.lock": { badge: "LOCK", label: "Lockfile", tone: "config" },
  "package-lock.json": { badge: "LOCK", label: "Lockfile", tone: "config" },
  "pnpm-lock.yaml": { badge: "LOCK", label: "Lockfile", tone: "config" },
  "yarn.lock": { badge: "LOCK", label: "Lockfile", tone: "config" },
  dockerfile: { badge: "DKR", label: "Docker", tone: "config" },
  makefile: { badge: "MK", label: "Makefile", tone: "config" },
  "readme.md": { badge: "DOC", label: "Readme", tone: "md" },
};

function isTestName(name: string): boolean {
  return (
    /\.(test|spec)\./i.test(name) ||
    /\.test$/i.test(name) ||
    /\.spec$/i.test(name) ||
    /(^|\/)__tests__\//i.test(name)
  );
}

/** Infer file type badge/label from a filename or path. */
export function resolveFileType(fileNameOrPath: string): FileTypeInfo {
  const normalized = fileNameOrPath.replaceAll("\\", "/");
  const base = normalized.includes("/")
    ? (normalized.split("/").pop() ?? normalized)
    : normalized;
  const lower = base.toLowerCase();

  const byName = NAME_MAP[lower];
  if (byName) return byName;

  if (isTestName(lower)) {
    const ext = lower.includes(".")
      ? lower.slice(lower.lastIndexOf(".") + 1)
      : "";
    const underlying = EXT_MAP[ext];
    return {
      badge: "TEST",
      label: underlying ? `${underlying.label} test` : "Test",
      tone: "test",
    };
  }

  const dot = lower.lastIndexOf(".");
  if (dot > 0) {
    const ext = lower.slice(dot + 1);
    const mapped = EXT_MAP[ext];
    if (mapped) return mapped;
    return {
      badge: ext.slice(0, 4).toUpperCase(),
      label: ext.toUpperCase(),
      tone: "other",
    };
  }

  return { badge: "FILE", label: "File", tone: "other" };
}
