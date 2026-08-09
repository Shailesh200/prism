import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HealthScore, RepositoryMap } from "@repo-prism/shared";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { DnaScreen, type DnaScreenProps } from "./DnaScreen.js";

/**
 * Two audited presentation bugs on the DNA screen:
 * - H3: the test_presence breakdown modal always showed the test/source ratio
 *   formula, even when Core scored the factor from a TestingReport (M-046).
 *   The formula now follows the scoring path the breakdown came from.
 * - L1: the Coupling Density meter used density ÷ 1.5 while the Overview used
 *   density × 100 — the same density rendered two different widths. Both now
 *   share `couplingDensityPct` (density 1.0 fills the meter).
 */

function stubClient(): AppShellClient {
  return {} as unknown as AppShellClient;
}

function healthWithTestPresence(
  breakdown: { label: string; value: string | number }[],
): HealthScore {
  return {
    score: 80,
    grade: "B",
    factors: [
      {
        id: "test_presence",
        label: "Test presence",
        score: 88,
        note: "Vitest unit suites",
        breakdown,
      },
    ],
  };
}

function renderDna(props: Partial<DnaScreenProps> = {}) {
  const allProps: DnaScreenProps = {
    repoLabel: "prism",
    dna: null,
    onNavigate: vi.fn(),
    onOpenDomain: vi.fn(),
    ...props,
  };
  return render(
    <AppShellClientProvider client={stubClient()}>
      <DnaScreen {...allProps} />
    </AppShellClientProvider>,
  );
}

describe("test_presence breakdown formula", () => {
  it("shows the TestingReport formula when the factor came from a report", async () => {
    const { container } = renderDna({
      health: healthWithTestPresence([
        { label: "Testing score", value: 88 },
        { label: "Runners", value: "vitest" },
      ]),
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Show Breakdown" }),
    );
    const formula = container.querySelector(".dna-modal__formula");
    expect(formula?.textContent).toContain("suite-kind diversity");
    expect(formula?.textContent).not.toContain("test files ÷ source files");
  });

  it("shows the ratio formula for the fallback path", async () => {
    const { container } = renderDna({
      health: healthWithTestPresence([
        { label: "Test files", value: 1 },
        { label: "Source files", value: 2 },
      ]),
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Show Breakdown" }),
    );
    const formula = container.querySelector(".dna-modal__formula");
    expect(formula?.textContent).toContain("test files ÷ source files");
  });
});

describe("coupling density meter", () => {
  it("uses the shared scale — density 0.5 fills half the meter", () => {
    const map = {
      graph: {
        id: "g",
        nodes: [
          { id: "a", kind: "file", label: "a" },
          { id: "b", kind: "file", label: "b" },
        ],
        edges: [{ id: "e0", kind: "depends_on", from: "a", to: "b" }],
      },
    } as unknown as RepositoryMap;
    const { container } = renderDna({
      health: healthWithTestPresence([]),
      map,
    });
    // The density card renders before the factor cards.
    const densityCard = container.querySelector(".dna-metric");
    const fill = densityCard?.querySelector(".ov-dna__fill");
    // 1 edge ÷ 2 nodes = 0.5 → 50% (the old DNA-only scale showed 33%).
    expect(fill?.getAttribute("style")).toContain("width: 50%");
  });
});
