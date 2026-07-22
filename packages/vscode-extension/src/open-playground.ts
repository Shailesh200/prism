import type * as vscode from "vscode";
import { BrowserBridge } from "./browser-bridge.js";
import type { PrismSession } from "./session.js";

/**
 * Open Prism in the system browser using the extension's own Core session
 * (loopback HTTP bridge — not a second Vite playground).
 */
export async function openPlaygroundInBrowser(
  vscodeApi: typeof vscode,
  opts: {
    session: PrismSession;
    extensionRoot: string;
  },
): Promise<void> {
  if (!opts.session.isOpen) {
    void vscodeApi.window.showWarningMessage(
      "Prism: open a folder and wait for indexing before opening in the browser.",
    );
    return;
  }

  try {
    const bridge = await BrowserBridge.ensure(opts.session, opts.extensionRoot);
    await vscodeApi.env.openExternal(vscodeApi.Uri.parse(bridge.url));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscodeApi.window.showErrorMessage(
      `Prism: could not start browser bridge — ${msg}`,
    );
  }
}
