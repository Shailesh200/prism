import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  BackendDomainReport,
  BackendReport,
  UtilityOverlayReport,
} from "@repo-prism/shared";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { DomainScreen, type DomainScreenProps } from "./DomainScreen.js";

/**
 * The backend Analyze button used to strand the screen on a bare skeleton:
 * no visible status, no step list, no cancel — and a rejected host request
 * kept it there forever. These tests pin the visible loading state, the
 * cancel/retry affordances, and the backend API Surface + Routes 50/50 pair.
 */

function stubClient(): AppShellClient {
  // Every method the backend domain touches in these states is optional, so
  // an empty stub keeps the test honest about what the screen actually needs.
  return {} as unknown as AppShellClient;
}

function renderDomain(
  props: Partial<DomainScreenProps> = {},
): ReturnType<typeof render> {
  const allProps: DomainScreenProps = {
    domainId: "backend",
    repoLabel: "prism",
    overlay: null,
    status: "idle",
    onRun: vi.fn(),
    onNavigate: vi.fn(),
    ...props,
  };
  return render(
    <AppShellClientProvider client={stubClient()}>
      <DomainScreen {...allProps} />
    </AppShellClientProvider>,
  );
}

function overlayFixture(kind: string, domain: string): UtilityOverlayReport {
  return {
    kind: kind as UtilityOverlayReport["kind"],
    domain,
    rootPath: "/repo",
    generatedAt: "2026-08-09T10:00:00.000Z",
    summary: "1 node",
    graph: {
      id: "g",
      nodes: [
        {
          id: "n1",
          kind: "route",
          label: "GET /users",
          attrs: { path: "packages/api/src/users.ts" },
        },
      ],
      edges: [],
    },
    mapLayer: { id: "l", label: "API", nodeKinds: [] },
    findings: [],
  };
}

describe("backend Analyze loading state", () => {
  it("says what is running instead of showing a bare skeleton", () => {
    renderDomain({ status: "loading" });

    const status = screen.getByRole("status");
    expect(status.textContent).toContain(
      "Analyzing Backend · Services & APIs…",
    );
    // The step list mirrors the host's runOverlay legs so the user can tell
    // real work is in flight.
    expect(status.textContent).toContain("api-surface overlay");
    expect(status.textContent).toContain("backend report");
  });

  it("offers Cancel while running and calls back into the host", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderDomain({ status: "loading", onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("hides Cancel when the host cannot cancel", () => {
    renderDomain({ status: "loading" });

    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});

describe("backend Analyze idle / error states", () => {
  it("runs the api-surface overlay from the idle card", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    renderDomain({ status: "idle", onRun });

    await user.click(screen.getByRole("button", { name: "Analyze" }));

    expect(onRun).toHaveBeenCalledWith("api-surface");
  });

  it("keeps a retry path visible after a failed run", () => {
    renderDomain({ status: "error" });

    expect(screen.getByText(/Analysis failed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Analyze" })).toBeTruthy();
  });
});

describe("backend ready layout", () => {
  it("pairs API Surface and Routes side-by-side at equal width", () => {
    const { container } = renderDomain({
      status: "ready",
      overlay: overlayFixture("api-surface", "backend"),
    });

    const pair = container.querySelector(".card-masonry > .dm-pair");
    expect(pair).not.toBeNull();
    expect(pair?.classList.contains("card-span-all")).toBe(true);
    expect(pair?.textContent).toContain("API Surface");
    expect(pair?.textContent).toContain("Routes");
  });

  it("leaves other domains in the masonry flow (no pair)", () => {
    const { container } = renderDomain({
      domainId: "devops_platform",
      status: "ready",
      overlay: overlayFixture("iac-resources", "devops_platform"),
    });

    expect(container.querySelector(".dm-pair")).toBeNull();
    expect(container.textContent).toContain("Infrastructure Surface");
  });
});

function backendReportFixture(): BackendReport {
  return {
    rootPath: "/repo",
    generatedAt: new Date().toISOString(),
    summary: "1 endpoint",
    frameworksDetected: ["express"],
    endpoints: [
      {
        id: "e1",
        method: "GET",
        path: "/users",
        handlerFile: "packages/api/src/users.ts",
        framework: "express",
        auth: "unknown",
        tested: false,
        testFiles: [],
        dataLayer: false,
        confidence: 0.9,
        evidence: [],
      },
    ],
    dataLayer: [],
    envVars: [],
    integrations: [],
    background: [],
  };
}

function backendDomainReportFixture(generatedAt: string): BackendDomainReport {
  const backend = backendReportFixture();
  return {
    domain: "backend",
    rootPath: "/repo",
    generatedAt,
    summary: backend.summary,
    backend,
    coverage: { total: 1, tested: 0, untested: backend.endpoints },
    mostDepended: [],
    churn: [],
    kindCounts: [{ kind: "route", count: 1 }],
    dataLayerByKind: { model: 0, migration: 0, sql: 0, client: 0 },
  };
}

/** Value rendered inside the KPI tile with the given label. */
function kpiValue(container: HTMLElement, label: string): string | null {
  const stats = [...container.querySelectorAll(".ov-stat")];
  const stat = stats.find((s) =>
    s.querySelector(".ov-stat__k")?.textContent?.includes(label),
  );
  return stat?.querySelector(".ov-stat__v")?.textContent ?? null;
}

describe("backend KPIs when the report is unavailable (B6)", () => {
  it("renders — instead of 0 for all four tiles", () => {
    const { container } = renderDomain({
      status: "ready",
      overlay: overlayFixture("api-surface", "backend"),
    });

    for (const label of ["Endpoints", "Untested", "Frameworks", "Data Layer"]) {
      expect(kpiValue(container, label)).toBe("—");
    }
  });

  it("renders real counts once a backend report is present", () => {
    const { container } = renderDomain({
      status: "ready",
      overlay: overlayFixture("api-surface", "backend"),
      backendReport: backendReportFixture(),
    });

    expect(kpiValue(container, "Endpoints")).toBe("1");
    expect(kpiValue(container, "Untested")).toBe("1");
    expect(kpiValue(container, "Frameworks")).toBe("1");
    expect(kpiValue(container, "Data Layer")).toBe("0");
  });
});

describe("runbar freshness disclosure (B1)", () => {
  it("shows the overlay run time and the report computation time together", () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    renderDomain({
      status: "ready",
      overlay: overlayFixture("api-surface", "backend"),
      domainReport: backendDomainReportFixture(threeDaysAgo),
    });

    const runbar = document.querySelector(".dm-runbar");
    expect(runbar?.textContent).toContain("Last run");
    expect(runbar?.textContent).toContain("Report computed 3d ago");
  });

  it("omits the report timestamp when no live domain report drives the numbers", () => {
    renderDomain({
      status: "ready",
      overlay: overlayFixture("api-surface", "backend"),
    });

    const runbar = document.querySelector(".dm-runbar");
    expect(runbar?.textContent).toContain("Last run");
    expect(runbar?.textContent).not.toContain("Report computed");
  });
});
