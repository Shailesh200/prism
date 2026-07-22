/** @prism/cursor-extension — packaging overlay (ADR-0020). */
export const PACKAGE_NAME = "@prism/cursor-extension" as const;

/** Product identity shared with the VS Code package (Core-only surface). */
export const IMPLEMENTS_PACKAGE = "@prism/vscode-extension" as const;

/** Public Core SDK consumed by the staged extension host. */
export const CORE_PACKAGE = "@prism/core" as const;
