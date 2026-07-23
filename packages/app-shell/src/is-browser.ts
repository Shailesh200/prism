/**
 * True when the shell runs in the system-browser bridge
 * (`data-prism-mode="browser"`), not inside a VS Code / Cursor webview.
 */
export function isBrowserShell(): boolean {
  return (
    typeof document !== "undefined" &&
    document.body?.dataset.prismMode === "browser"
  );
}
