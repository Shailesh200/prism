import type * as vscode from "vscode";
import { findConsole, NO_CONSOLE_MESSAGE } from "./console-link.js";
import type { PrismSession } from "@repo-prism/host-session";

/**
 * Open Prism in the system browser, pointed at the Prism Console.
 *
 * This used to start a loopback server inside the extension on `:17321` — no
 * token, `Access-Control-Allow-Origin: *`, and dead the moment the editor
 * closed. ADR-0048 retired it: the Console already runs as a user-level
 * daemon with a token, and it answers the same RPC.
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
    const link = await findConsole();
    if (!link) {
      void vscodeApi.window.showWarningMessage(NO_CONSOLE_MESSAGE);
      return;
    }
    await vscodeApi.env.openExternal(vscodeApi.Uri.parse(link.url));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscodeApi.window.showErrorMessage(
      `Prism: could not open the Prism Console — ${msg}`,
    );
  }
}
