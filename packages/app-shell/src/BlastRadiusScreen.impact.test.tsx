// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { BlastRadiusScreen } from "./BlastRadiusScreen.js";

afterEach(() => {
  cleanup();
});

function mockClient(overrides: Partial<AppShellClient> = {}): AppShellClient {
  return {
    fetchDependencyGraph: vi.fn().mockResolvedValue({
      id: "dep",
      nodes: [],
      edges: [],
    }),
    fetchImpactBundle: vi.fn().mockResolvedValue({
      ok: false,
      error: "unused",
    }),
    fetchSymbolHits: vi.fn().mockResolvedValue([]),
    fetchExplainArea: vi.fn().mockResolvedValue({
      path: "src/a.ts",
      domains: ["backend"],
      dependencyDegree: { in: 1, out: 2 },
      owners: ["ada"],
      summary: "A source module used by checkout.",
    }),
    fetchChangeReview: vi.fn().mockResolvedValue({
      generatedAt: new Date().toISOString(),
      items: [
        {
          path: "src/a.ts",
          risk: 12,
          affectedFilesCount: 2,
          testsLikelyAffected: [],
          breakingChanges: [],
        },
      ],
      overallRisk: 12,
      band: "low",
      totalAffectedFiles: 2,
      totalTestsAffected: 0,
      totalBreakingChanges: 0,
    }),
    ...overrides,
  } as unknown as AppShellClient;
}

function renderImpact(
  client: AppShellClient,
  props: Partial<Parameters<typeof BlastRadiusScreen>[0]> = {},
) {
  const onNavigate = vi.fn();
  render(
    <AppShellClientProvider client={client}>
      <BlastRadiusScreen
        root="/repo"
        repoLabel="prism"
        onNavigate={onNavigate}
        {...props}
      />
    </AppShellClientProvider>,
  );
  return { onNavigate, client };
}

describe("Impact workspace", () => {
  it("shows one Impact chrome with Explain / Blast / Review tabs", () => {
    renderImpact(mockClient());
    expect(screen.getByRole("button", { name: "Impact" })).toBeTruthy();
    expect(document.querySelector(".ov-top__title")?.textContent).toBe(
      "Impact",
    );
    expect(screen.getByRole("tab", { name: "Explain" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Blast radius" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Review changes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use dirty files" })).toBeTruthy();
    expect(screen.getByText("Pick a file to inspect")).toBeTruthy();
  });

  it("keeps the target while switching tabs via onNavigate", async () => {
    const { onNavigate } = renderImpact(mockClient(), {
      initialFile: "src/a.ts",
      initialTab: "blast",
    });
    expect(screen.getByTitle("src/a.ts")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Explain" }));
    expect(onNavigate).toHaveBeenCalledWith("explain");
    expect(screen.getByTitle("src/a.ts")).toBeTruthy();
  });

  it("explains the selected file on the Explain tab", async () => {
    const client = mockClient();
    renderImpact(client, {
      initialFile: "src/a.ts",
      initialTab: "explain",
    });
    await waitFor(() => {
      expect(client.fetchExplainArea).toHaveBeenCalledWith("src/a.ts");
      expect(
        screen.getByText("A source module used by checkout."),
      ).toBeTruthy();
    });
  });

  it("reviews dirty files without requiring a path list", async () => {
    const client = mockClient();
    renderImpact(client, { initialTab: "review" });
    await userEvent.click(
      screen.getByRole("button", { name: "Use dirty files" }),
    );
    await waitFor(() => {
      expect(client.fetchChangeReview).toHaveBeenCalledWith([]);
      expect(document.querySelector(".cr-table-scroll")).toBeTruthy();
      expect(screen.getByRole("columnheader", { name: "Path" })).toBeTruthy();
    });
  });

  it("loads dirty files as the Explain target", async () => {
    const client = mockClient({
      fetchChangedPaths: vi.fn().mockResolvedValue(["src/a.ts", "src/b.ts"]),
    });
    renderImpact(client, { initialTab: "explain" });
    await userEvent.click(
      screen.getByRole("button", { name: "Use dirty files" }),
    );
    await waitFor(() => {
      expect(client.fetchChangedPaths).toHaveBeenCalled();
      expect(client.fetchExplainArea).toHaveBeenCalledWith("src/a.ts");
    });
    expect(screen.getByText("2 paths")).toBeTruthy();
    expect(client.fetchChangeReview).not.toHaveBeenCalled();
  });

  it("loads dirty files as the Blast radius target", async () => {
    const client = mockClient({
      fetchChangedPaths: vi.fn().mockResolvedValue(["src/a.ts"]),
    });
    renderImpact(client, { initialTab: "blast" });
    await userEvent.click(
      screen.getByRole("button", { name: "Use dirty files" }),
    );
    await waitFor(() => {
      expect(client.fetchChangedPaths).toHaveBeenCalled();
      expect(client.fetchImpactBundle).toHaveBeenCalled();
    });
    expect(screen.getByTitle("src/a.ts")).toBeTruthy();
  });

  it("collapses a large review path set behind Show more", async () => {
    const paths = Array.from(
      { length: 20 },
      (_, i) => `packages/app-shell/src/file-${i}.tsx`,
    );
    renderImpact(mockClient(), {
      initialTab: "review",
      initialPaths: paths,
    });
    expect(screen.getByText("20 paths")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Show 12 more" }),
    ).toBeTruthy();
    expect(screen.queryByTitle(paths[8] ?? "")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show 12 more" }));
    expect(screen.getByTitle(paths[8] ?? "")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByText("20 paths")).toBeNull();
  });
});
