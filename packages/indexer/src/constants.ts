/** Default max file size to hash (5 MiB). Oversized files are listed as skipped. */
export const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Bytes to sniff for NUL when classifying binary content. */
export const BINARY_SNIFF_BYTES = 8192;

/**
 * Built-in ignore patterns (gitignore syntax).
 * Always applied in addition to `.gitignore` / `.prismignore`.
 */
export const BUILTIN_IGNORE_PATTERNS: readonly string[] = [
  ".git/",
  ".prism/",
  "node_modules/",
  "dist/",
  "coverage/",
  ".DS_Store",
  // Common binaries / media (also caught by NUL sniff)
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.webp",
  "*.ico",
  "*.pdf",
  "*.zip",
  "*.gz",
  "*.tgz",
  "*.7z",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.eot",
  "*.exe",
  "*.dll",
  "*.so",
  "*.dylib",
  "*.bin",
  "*.wasm",
];
