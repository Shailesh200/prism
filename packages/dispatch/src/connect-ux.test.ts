import { describe, expect, it } from "vitest";
import {
  canAttemptUrlElicitation,
  clientLooksLikeClaude,
  clientLooksLikeCursor,
  connectPlan,
  hasFormElicitation,
  hasUrlElicitation,
  markConnectStep,
  shouldOpenAuthPage,
  skipConnectStep,
} from "./connect-ux.js";

describe("host detection", () => {
  it("recognises Cursor and Claude client names", () => {
    expect(clientLooksLikeCursor("cursor")).toBe(true);
    expect(clientLooksLikeCursor("Cursor")).toBe(true);
    expect(clientLooksLikeClaude("claude-code")).toBe(true);
    expect(clientLooksLikeClaude("Claude Desktop")).toBe(true);
    expect(clientLooksLikeCursor("claude-code")).toBe(false);
  });

  it("treats empty elicitation as form-only", () => {
    expect(hasFormElicitation({})).toBe(true);
    expect(hasUrlElicitation({})).toBe(false);
    expect(hasUrlElicitation({ url: {} })).toBe(true);
  });

  it("attempts URL elicitation for Cursor even when only form was advertised", () => {
    expect(
      canAttemptUrlElicitation({
        clientName: "cursor",
        elicitation: {},
      }),
    ).toBe(true);
    expect(
      canAttemptUrlElicitation({
        clientName: "other",
        elicitation: {},
      }),
    ).toBe(false);
    expect(
      canAttemptUrlElicitation({
        clientName: "other",
        elicitation: { url: {} },
      }),
    ).toBe(true);
  });

  it("opens the auth page for Claude, not for Cursor with a native control", () => {
    expect(
      shouldOpenAuthPage({ clientName: "cursor", urlElicitation: true }),
    ).toBe(false);
    expect(
      shouldOpenAuthPage({ clientName: "claude-code", urlElicitation: true }),
    ).toBe(true);
    expect(
      shouldOpenAuthPage({ clientName: "unknown", urlElicitation: false }),
    ).toBe(true);
  });
});

describe("connect steps", () => {
  it("lists a dedicated plan the host can surface", () => {
    const steps = connectPlan("Google Calendar");
    expect(steps.map((step) => step.id)).toEqual([
      "confirm",
      "prepare",
      "authenticate",
      "store",
      "done",
    ]);
    const skipped = skipConnectStep(steps, "confirm");
    expect(skipped[0]?.status).toBe("skipped");
    const active = markConnectStep(skipped, "authenticate", "active");
    expect(active.find((step) => step.id === "authenticate")?.status).toBe(
      "active",
    );
  });
});
