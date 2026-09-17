/**
 * Advisory work-order save hook (M-076 O3/O4).
 *
 * Reports allowed / blocked / needsSignOff. Never cancels the save unless
 * an Accepted ADR has armed the hook (`evaluation.veto`).
 */

import { evaluateWorkOrderWrite, type WorkOrder } from "@repo-prism/shared";

export type WorkOrderHookWorkspace = {
  asRelativePath(pathOrUri: unknown, includeWorkspaceFolder?: boolean): string;
  onWillSaveTextDocument(
    listener: (event: { readonly document: { readonly uri: unknown } }) => void,
  ): { dispose(): void };
};

export type WorkOrderHookWindow = {
  showWarningMessage(message: string): unknown;
  showErrorMessage(message: string): unknown;
};

export function registerWorkOrderSaveHook(
  workspace: WorkOrderHookWorkspace,
  window: WorkOrderHookWindow,
  getOrder: () => WorkOrder | undefined,
): { dispose(): void } {
  return workspace.onWillSaveTextDocument((event) => {
    const path = workspace
      .asRelativePath(event.document.uri, false)
      .replace(/\\/g, "/");
    const evaluation = evaluateWorkOrderWrite(path, getOrder());
    if (evaluation.state === "allowed") return;
    if (evaluation.veto) {
      void window.showErrorMessage(`Prism work order: ${evaluation.copy}`);
      return;
    }
    void window.showWarningMessage(`Prism work order: ${evaluation.copy}`);
  });
}
