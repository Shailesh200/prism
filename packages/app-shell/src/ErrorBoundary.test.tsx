import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismErrorBoundary } from "./ErrorBoundary.js";

/**
 * The boundary is the last thing between a bug and a blank panel. These tests
 * are about what the user is left looking at.
 */

function Boom({ message }: { message: string }): ReactElement {
  throw new Error(message);
}

function Empty(): ReactElement {
  throw new Error("");
}

/** A screen that fails, with a button that navigates away from it. */
function NavigatingShell(): ReactElement {
  const [view, setView] = useState("broken");
  return (
    <>
      <button type="button" onClick={() => setView("healthy")}>
        Go to Overview
      </button>
      <PrismErrorBoundary label="View" resetKey={view}>
        {view === "broken" ? <Boom message="bad screen" /> : <p>Overview</p>}
      </PrismErrorBoundary>
    </>
  );
}

/** A screen that fails, with a button that only forces a re-render. */
function RerenderingShell(): ReactElement {
  const [, force] = useState(0);
  return (
    <>
      <button type="button" onClick={() => force((n) => n + 1)}>
        Re-render
      </button>
      <PrismErrorBoundary label="View">
        <Boom message="persistent" />
      </PrismErrorBoundary>
    </>
  );
}

beforeEach(() => {
  // React logs caught render errors, and the boundary adds its own trail.
  // Both are wanted in production and only noise here.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("when a child throws", () => {
  it("names the view that failed instead of failing anonymously", () => {
    render(
      <PrismErrorBoundary label="Blast Radius">
        <Boom message="graph unavailable" />
      </PrismErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Blast Radius failed to render/)).toBeTruthy();
  });

  it("shows the error message, because 'something went wrong' is unactionable", () => {
    render(
      <PrismErrorBoundary label="Trends">
        <Boom message="health history is empty" />
      </PrismErrorBoundary>,
    );

    expect(screen.getByText("health history is empty")).toBeTruthy();
  });

  it("falls back to a generic line when the error carries no message", () => {
    render(
      <PrismErrorBoundary label="Domains">
        <Empty />
      </PrismErrorBoundary>,
    );

    // An empty <p> would read as a rendering bug on top of the original one.
    expect(screen.getByText("An unexpected error occurred.")).toBeTruthy();
  });

  it("still says something useful when no label was given", () => {
    render(
      <PrismErrorBoundary>
        <Boom message="nope" />
      </PrismErrorBoundary>,
    );

    expect(screen.getByText(/This view failed to render/)).toBeTruthy();
  });

  it("reports the failure to the host so it reaches the log", () => {
    const onError = vi.fn();
    render(
      <PrismErrorBoundary label="Overview" onError={onError}>
        <Boom message="indexing failed" />
      </PrismErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]?.message).toBe("indexing failed");
  });

  it("prefers a custom fallback when the caller supplied one", () => {
    render(
      <PrismErrorBoundary label="Map" fallback={<p>Map is unavailable</p>}>
        <Boom message="internal" />
      </PrismErrorBoundary>,
    );

    expect(screen.getByText("Map is unavailable")).toBeTruthy();
    expect(screen.queryByText(/failed to render/)).toBeNull();
  });
});

describe("recovering", () => {
  it("offers a retry that re-renders the child", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;
    function Flaky(): ReactElement {
      if (shouldThrow) throw new Error("transient");
      return <p>recovered</p>;
    }

    render(
      <PrismErrorBoundary label="Testing">
        <Flaky />
      </PrismErrorBoundary>,
    );
    expect(screen.getByText("transient")).toBeTruthy();

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("recovered")).toBeTruthy();
  });

  it("clears itself when the user navigates, rather than sticking on the new screen", async () => {
    const user = userEvent.setup();
    render(<NavigatingShell />);
    expect(screen.getByText("bad screen")).toBeTruthy();

    // Without the reset key the boundary would hold its failed state and the
    // user would be stranded — every tab showing one screen's crash.
    await user.click(screen.getByRole("button", { name: "Go to Overview" }));

    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not reset when no reset key is in play", async () => {
    const user = userEvent.setup();
    render(<RerenderingShell />);
    await user.click(screen.getByRole("button", { name: "Re-render" }));

    // A parent re-render is not a signal that the problem is gone. Clearing on
    // one would loop: reset, re-throw, reset.
    expect(screen.getByText("persistent")).toBeTruthy();
  });
});
