/**
 * Iris and Skills live in this package now. The helper remains so older
 * hosts that built an embed URL can detect they should stop.
 */

export type HubEmbedView = "iris" | "skills" | "envelope";

/** @deprecated Native Dashboard screens — do not iframe the daemon. */
export function embedDashboardUrl(
  _consoleUrl: string,
  _view: HubEmbedView,
  _daemonPort?: number,
): string {
  return "";
}
