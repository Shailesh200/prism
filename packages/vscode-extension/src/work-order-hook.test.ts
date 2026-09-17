import { describe, expect, it } from "vitest";
import { registerWorkOrderSaveHook } from "./work-order-hook.js";
import type { WorkOrder } from "@repo-prism/shared";

const order: WorkOrder = {
  inScope: ["src/ok.ts"],
  offLimits: [{ path: "vendor/legacy.ts", reason: "vendor" }],
  needsSignOff: ["src/hot.ts"],
  advisory: true,
  hookArmed: false,
};

function fakeEvent(path: string) {
  return {
    document: { uri: { fsPath: path, path } },
  };
}

describe("work-order save hook (M-076 O3/O4)", () => {
  it("warns on blocked paths and never vetoes when not armed", () => {
    const warnings: string[] = [];
    const errors: string[] = [];
    const disposable = registerWorkOrderSaveHook(
      {
        asRelativePath: (uri: { path?: string; fsPath?: string }) =>
          String(uri.path ?? uri.fsPath),
        onWillSaveTextDocument: (handler) => {
          handler(fakeEvent("vendor/legacy.ts") as never);
          return { dispose() {} };
        },
      },
      {
        showWarningMessage: (msg: string) => {
          warnings.push(msg);
          return Promise.resolve(undefined);
        },
        showErrorMessage: (msg: string) => {
          errors.push(msg);
          return Promise.resolve(undefined);
        },
      },
      () => order,
    );
    expect(warnings[0]).toMatch(/not armed/);
    expect(errors).toEqual([]);
    disposable.dispose();
  });

  it("errors only when the hook is armed", () => {
    const errors: string[] = [];
    registerWorkOrderSaveHook(
      {
        asRelativePath: (uri: { path?: string; fsPath?: string }) =>
          String(uri.path ?? uri.fsPath),
        onWillSaveTextDocument: (handler) => {
          handler(fakeEvent("vendor/legacy.ts") as never);
          return { dispose() {} };
        },
      },
      {
        showWarningMessage: () => Promise.resolve(undefined),
        showErrorMessage: (msg: string) => {
          errors.push(msg);
          return Promise.resolve(undefined);
        },
      },
      () => ({ ...order, advisory: false, hookArmed: true }),
    );
    expect(errors[0]).toMatch(/Blocked/);
  });
});
