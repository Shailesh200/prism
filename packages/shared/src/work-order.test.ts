import { describe, expect, it } from "vitest";
import {
  evaluateWorkOrderWrite,
  isAcceptedWorkOrderVetoAdr,
  isWorkOrderOffLimitPath,
  offLimitReason,
  workOrderStateCopy,
} from "./work-order.js";

const order = {
  inScope: ["src/users/fetchUser.ts"],
  offLimits: [
    { path: "vendor/legacy.ts", reason: "vendor" as const },
    { path: "src/generated/types.ts", reason: "generated" as const },
  ],
  needsSignOff: ["src/app.ts"],
  advisory: true,
  hookArmed: false,
};

describe("work-order paths (M-076)", () => {
  it("marks vendor and generated paths off-limits", () => {
    expect(offLimitReason("vendor/legacy.ts")).toBe("vendor");
    expect(offLimitReason("pkg/vendor/lib.ts")).toBe("vendor");
    expect(offLimitReason("src/generated/types.ts")).toBe("generated");
    expect(offLimitReason("src/foo.gen.ts")).toBe("generated");
    expect(isWorkOrderOffLimitPath("src/users/fetchUser.ts")).toBe(false);
  });
});

describe("work-order hook ADR (M-076 O3)", () => {
  it("does not arm on a Proposed ADR", () => {
    expect(
      isAcceptedWorkOrderVetoAdr(
        "| Status | Proposed |\n\nWork-order write veto is opt-in.",
      ),
    ).toBe(false);
  });

  it("arms only when Status is Accepted and the text is a veto ADR", () => {
    expect(
      isAcceptedWorkOrderVetoAdr(
        "| Status | Accepted |\n\nWork-order write veto is live.",
      ),
    ).toBe(true);
    expect(
      isAcceptedWorkOrderVetoAdr("| Status | Accepted |\n\nUse bun."),
    ).toBe(false);
  });
});

describe("evaluateWorkOrderWrite (M-076 O3/O4)", () => {
  it("never vetoes when the hook is not armed", () => {
    const vendor = evaluateWorkOrderWrite("vendor/legacy.ts", order);
    expect(vendor.state).toBe("blocked");
    expect(vendor.veto).toBe(false);
    expect(vendor.copy).toMatch(/not armed/);

    const sign = evaluateWorkOrderWrite("src/app.ts", order);
    expect(sign.state).toBe("needsSignOff");
    expect(sign.veto).toBe(false);
    expect(sign.copy).toMatch(/not armed/);

    const ok = evaluateWorkOrderWrite("src/users/fetchUser.ts", order);
    expect(ok.state).toBe("allowed");
    expect(ok.veto).toBe(false);
  });

  it("vetoes blocked and needsSignOff only when the hook is armed", () => {
    const armed = { ...order, advisory: false, hookArmed: true };
    expect(evaluateWorkOrderWrite("vendor/legacy.ts", armed).veto).toBe(true);
    expect(evaluateWorkOrderWrite("src/app.ts", armed).veto).toBe(true);
    expect(evaluateWorkOrderWrite("src/users/fetchUser.ts", armed).veto).toBe(
      false,
    );
  });

  it("classifies vendor/generated without a stored order", () => {
    const hit = evaluateWorkOrderWrite("vendor/legacy.ts", undefined);
    expect(hit.state).toBe("blocked");
    expect(hit.veto).toBe(false);
    expect(hit.copy).toMatch(/not armed/);
  });
});

describe("work-order copy (M-076 O4)", () => {
  it("documents blocked as not armed while advisory", () => {
    expect(workOrderStateCopy("blocked", false)).toMatch(/not armed/);
    expect(workOrderStateCopy("needsSignOff", false)).toMatch(/not armed/);
    expect(workOrderStateCopy("allowed", false)).toMatch(/Allowed/);
  });
});
