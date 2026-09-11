// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrismBootScreen } from "./PrismBootScreen.js";

afterEach(() => {
  cleanup();
});

describe("PrismBootScreen", () => {
  it("shows an indeterminate meter and map skeleton instead of job cards", () => {
    render(
      <PrismBootScreen title="Indexing repository…" detail="/Users/me/Prism" />,
    );
    expect(screen.getByText("Indexing repository…")).toBeTruthy();
    expect(
      screen.getByText("Local index · stays on this machine"),
    ).toBeTruthy();
    expect(screen.getByText("Reading the tree")).toBeTruthy();
    expect(screen.getByText("/Users/me/Prism")).toBeTruthy();
    const meter = screen.getByRole("progressbar", {
      name: "Indexing repository…",
    });
    expect(meter.getAttribute("data-indeterminate")).toBe("true");
    expect(screen.getByLabelText("Building the map")).toBeTruthy();
    expect(document.querySelector(".prism-skeleton__card")).toBeNull();
  });
});
