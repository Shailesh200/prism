import type * as vscode from "vscode";
import type { PrismSession } from "./session.js";

const HEALTH_ALERT_SIGNATURE_KEY = "prism.healthAlert.signature";
/** Minimum health-score drop (points) or region-mover delta to warn on. */
const REGRESSION_THRESHOLD = 5;

/**
 * After the index settles (watch → `fresh`, manual reindex, or first boot),
 * compare the last two health-history points and the current region movers.
 * Warns at most once per distinct signature per workspace (M-048 Phase 7).
 */
export async function checkHealthRegression(
  vscodeApi: typeof vscode,
  session: PrismSession,
  context: vscode.ExtensionContext | undefined,
): Promise<void> {
  if (!context) return;
  try {
    const [historyRes, moversRes] = await Promise.all([
      session.getHealthHistory(),
      session.getRegionMovers(),
    ]);

    let message: string | null = null;
    let signature: string | null = null;

    const points = historyRes.ok ? historyRes.value.points : [];
    if (points.length >= 2) {
      const prev = points[points.length - 2]!;
      const last = points[points.length - 1]!;
      const drop = prev.score - last.score;
      if (drop >= REGRESSION_THRESHOLD) {
        message = `Prism: health score dropped ${Math.round(drop)} points (${Math.round(
          prev.score,
        )} → ${Math.round(last.score)}).`;
        signature = `score:${last.at}`;
      }
    }

    if (!message && moversRes.ok && moversRes.value.regressing.length > 0) {
      const worst = moversRes.value.regressing.reduce((a, b) =>
        b.delta < a.delta ? b : a,
      );
      if (worst.delta <= -REGRESSION_THRESHOLD) {
        message = `Prism: ${worst.label} is regressing (${Math.round(
          worst.fromScore,
        )} → ${Math.round(worst.toScore)}).`;
        signature = `region:${worst.id}:${worst.toScore.toFixed(1)}`;
      }
    }

    if (!message || !signature) return;
    const lastSignature = context.workspaceState.get<string>(
      HEALTH_ALERT_SIGNATURE_KEY,
    );
    if (lastSignature === signature) return;
    await context.workspaceState.update(HEALTH_ALERT_SIGNATURE_KEY, signature);

    void vscodeApi.window
      .showWarningMessage(message, "Open Overview")
      .then((pick) => {
        if (pick === "Open Overview") {
          void vscodeApi.commands.executeCommand("prism.showHealth");
        }
      });
  } catch {
    // Best-effort — never block boot/reindex on alert computation.
  }
}
