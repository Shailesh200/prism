// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrismSurfacePips, PrismWakeScreen } from "./PrismWakeScreen.js";
import { wakeHeadline, wakeLede } from "./surface-status.js";

afterEach(() => {
  cleanup();
});

describe("wakeHeadline", () => {
  it("names the surface that is actually up", () => {
    expect(wakeHeadline(true, true)).toBe("Prism is awake.");
    expect(wakeHeadline(true, false)).toBe("Dispatch is awake.");
    expect(wakeHeadline(false, true)).toBe("Spectrum is awake.");
  });
});

describe("wakeLede", () => {
  it("does not pretend Spectrum is up when it is down", () => {
    expect(wakeLede(true, false)).toMatch(/Spectrum is down/);
    expect(wakeLede(true, true)).toMatch(/Dispatch and Spectrum/);
  });
});

describe("PrismWakeScreen", () => {
  it("labels the jobs door Dispatch, not Console, and shows per-surface status", () => {
    render(
      <PrismWakeScreen
        here="dispatch"
        dispatchLive={true}
        spectrumLive={false}
        onOpenDispatch={() => undefined}
        onOpenSpectrum={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "Dispatch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Dispatch" })).toBeTruthy();
    expect(screen.queryByText("Console")).toBeNull();
    expect(screen.getAllByText("Awake").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Down").length).toBeGreaterThan(0);
    expect(screen.getByText(/Spectrum is down/)).toBeTruthy();
  });

  it("closes on the Close control and Escape", () => {
    let closed = 0;
    render(
      <PrismWakeScreen
        here="spectrum"
        dispatchLive={true}
        spectrumLive={true}
        onOpenDispatch={() => undefined}
        onOpenSpectrum={() => undefined}
        onClose={() => {
          closed += 1;
        }}
      />,
    );
    screen.getByRole("button", { name: "Close" }).click();
    expect(closed).toBe(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(closed).toBe(2);
  });
});

describe("PrismSurfacePips", () => {
  it("shows Dispatch and Spectrum as separate chips", () => {
    render(<PrismSurfacePips dispatchLive={true} spectrumLive={false} />);
    expect(screen.getByText(/Dispatch · awake/)).toBeTruthy();
    expect(screen.getByText(/Spectrum · down/)).toBeTruthy();
  });
});
