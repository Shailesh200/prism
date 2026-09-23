// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrismSurfacePips, PrismWakeScreen } from "./PrismWakeScreen.js";
import { wakeHeadline, wakeLede } from "./surface-status.js";

afterEach(() => {
  cleanup();
});

describe("wakeHeadline", () => {
  it("names the one Dashboard", () => {
    expect(wakeHeadline(true, true)).toBe("Prism is awake.");
    expect(wakeHeadline(true, false)).toBe("Prism is awake.");
    expect(wakeHeadline(false, true)).toBe("Prism is awake.");
    expect(wakeHeadline(false, false)).toBe("Prism is down.");
  });
});

describe("wakeLede", () => {
  it("does not name Dispatch or Spectrum", () => {
    expect(wakeLede(true, true)).toMatch(/Prism Dashboard/);
    expect(wakeLede(true, false)).not.toMatch(/Spectrum|Dispatch/);
    expect(wakeLede(false, false)).toMatch(/prism wake/i);
  });
});

describe("PrismWakeScreen", () => {
  it("offers one Dashboard door", () => {
    render(
      <PrismWakeScreen
        here="spectrum"
        dispatchLive={true}
        spectrumLive={true}
        onOpenDispatch={() => undefined}
        onOpenSpectrum={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Dashboard" })).toBeTruthy();
    expect(screen.queryByText("Console")).toBeNull();
    expect(screen.queryByText("Spectrum")).toBeNull();
    expect(screen.queryByText("Dispatch")).toBeNull();
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
  it("shows one Dashboard chip", () => {
    render(<PrismSurfacePips dispatchLive={true} spectrumLive={false} />);
    expect(screen.getByText(/Dashboard · awake/)).toBeTruthy();
    expect(screen.queryByText(/Dispatch/)).toBeNull();
    expect(screen.queryByText(/Spectrum/)).toBeNull();
  });
});
