// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { GuardScreen } from "./GuardScreen.js";

afterEach(() => {
  cleanup();
});

function mockClient(overrides: Partial<AppShellClient> = {}): AppShellClient {
  return {
    fetchGuardSession: vi.fn().mockResolvedValue({
      generatedAt: new Date().toISOString(),
      files: [
        {
          path: "src/hubA.ts",
          risk: 82,
          band: "high",
          flags: [
            {
              kind: "orphan",
              detail: "Nothing imports this yet",
              provenance: "measured",
            },
          ],
        },
        {
          path: "src/leaf1.ts",
          risk: 4,
          band: "low",
          flags: [],
        },
      ],
      excludedPreExisting: ["src/leaf17.ts"],
      totalDirty: 3,
      truncated: false,
    }),
    ...overrides,
  } as unknown as AppShellClient;
}

describe("GuardScreen", () => {
  it("ranks files highest-risk first and shows their flags", async () => {
    const client = mockClient();
    render(
      <AppShellClientProvider client={client}>
        <GuardScreen repoLabel="prism" onNavigate={vi.fn()} />
      </AppShellClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("src/hubA.ts")).toBeTruthy();
    });
    expect(screen.getByText("Orphan")).toBeTruthy();
    expect(screen.getByText(/Excluded 1 file\(s\) already dirty/)).toBeTruthy();

    const paths = screen
      .getAllByRole("button")
      .map((el) => el.textContent)
      .filter((text) => text?.startsWith("src/"));
    expect(paths).toEqual(["src/hubA.ts", "src/leaf1.ts"]);
  });

  it("shows an empty state when nothing is dirty", async () => {
    const client = mockClient({
      fetchGuardSession: vi.fn().mockResolvedValue({
        generatedAt: new Date().toISOString(),
        files: [],
        excludedPreExisting: [],
        totalDirty: 0,
        truncated: false,
      }),
    });
    render(
      <AppShellClientProvider client={client}>
        <GuardScreen repoLabel="prism" onNavigate={vi.fn()} />
      </AppShellClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Nothing dirty right now/)).toBeTruthy();
    });
  });

  it("shows an error when the surface does not support Guard", async () => {
    const client = {} as AppShellClient;
    render(
      <AppShellClientProvider client={client}>
        <GuardScreen repoLabel="prism" onNavigate={vi.fn()} />
      </AppShellClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Guard is not supported on this surface."),
      ).toBeTruthy();
    });
  });
});
