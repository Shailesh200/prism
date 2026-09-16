// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import {
  __resetGuardSessionCacheForTests,
  GuardScreen,
} from "./GuardScreen.js";

afterEach(() => {
  cleanup();
  __resetGuardSessionCacheForTests();
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

    expect(screen.getByTestId("guard-row-src/hubA.ts")).toBeTruthy();
    expect(screen.getByTestId("guard-row-src/leaf1.ts")).toBeTruthy();
  });

  it("opens the accordion when clicking anywhere on the row, including the filename", async () => {
    const client = mockClient();
    render(
      <AppShellClientProvider client={client}>
        <GuardScreen repoLabel="prism" onNavigate={vi.fn()} />
      </AppShellClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("src/hubA.ts")).toBeTruthy();
    });
    expect(screen.queryByText(/Nothing imports this yet/)).toBeNull();

    // Click directly on the filename text, not just the row background.
    fireEvent.click(screen.getByText("src/hubA.ts"));

    await waitFor(() => {
      expect(screen.getByText(/Nothing imports this yet/)).toBeTruthy();
    });
  });

  it("opens the file without toggling the accordion when the open-file icon is clicked", async () => {
    const onOpenPath = vi.fn();
    const client = mockClient();
    render(
      <AppShellClientProvider client={client}>
        <GuardScreen
          repoLabel="prism"
          onNavigate={vi.fn()}
          onOpenPath={onOpenPath}
        />
      </AppShellClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("src/hubA.ts")).toBeTruthy();
    });

    fireEvent.click(
      within(screen.getByTestId("guard-row-src/hubA.ts")).getByTitle(
        "Open file",
      ),
    );

    expect(onOpenPath).toHaveBeenCalledWith("src/hubA.ts");
    expect(screen.queryByText(/Nothing imports this yet/)).toBeNull();
  });

  it("caches the session across a remount, so switching tabs and back does not recompute", async () => {
    const fetchGuardSession = vi.fn().mockResolvedValue({
      generatedAt: new Date().toISOString(),
      files: [{ path: "src/a.ts", risk: 10, band: "low", flags: [] }],
      excludedPreExisting: [],
      totalDirty: 1,
      truncated: false,
    });
    const client = mockClient({ fetchGuardSession });

    const { unmount } = render(
      <AppShellClientProvider client={client}>
        <GuardScreen repoLabel="prism" onNavigate={vi.fn()} />
      </AppShellClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText("src/a.ts")).toBeTruthy();
    });
    expect(fetchGuardSession).toHaveBeenCalledTimes(1);

    // Simulates leaving the Guard tab (unmounting GuardScreen) and coming
    // back to it — the real trigger for the "recomputes every time" bug.
    unmount();
    render(
      <AppShellClientProvider client={client}>
        <GuardScreen repoLabel="prism" onNavigate={vi.fn()} />
      </AppShellClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("src/a.ts")).toBeTruthy();
    });
    expect(fetchGuardSession).toHaveBeenCalledTimes(1);
  });

  it("still recomputes on an explicit Refresh even when a cached session exists", async () => {
    const fetchGuardSession = vi.fn().mockResolvedValue({
      generatedAt: new Date().toISOString(),
      files: [{ path: "src/a.ts", risk: 10, band: "low", flags: [] }],
      excludedPreExisting: [],
      totalDirty: 1,
      truncated: false,
    });
    const client = mockClient({ fetchGuardSession });
    render(
      <AppShellClientProvider client={client}>
        <GuardScreen repoLabel="prism" onNavigate={vi.fn()} />
      </AppShellClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText("src/a.ts")).toBeTruthy();
    });
    expect(fetchGuardSession).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));

    await waitFor(() => {
      expect(fetchGuardSession).toHaveBeenCalledTimes(2);
    });
  });

  it("collapses many same-kind flags into one counted badge, and expands detail on click", async () => {
    const client = mockClient({
      fetchGuardSession: vi.fn().mockResolvedValue({
        generatedAt: new Date().toISOString(),
        files: [
          {
            path: "src/http-transport.ts",
            risk: 19,
            band: "low",
            flags: [
              {
                kind: "duplicate",
                detail: "looks like fetchA",
                provenance: "heuristic",
              },
              {
                kind: "duplicate",
                detail: "looks like fetchB",
                provenance: "heuristic",
              },
              {
                kind: "duplicate",
                detail: "looks like fetchC",
                provenance: "heuristic",
              },
              {
                kind: "boundary",
                detail: "crosses into ui",
                provenance: "heuristic",
              },
            ],
          },
        ],
        excludedPreExisting: [],
        totalDirty: 1,
        truncated: false,
      }),
    });
    render(
      <AppShellClientProvider client={client}>
        <GuardScreen repoLabel="prism" onNavigate={vi.fn()} />
      </AppShellClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("3 Duplicate")).toBeTruthy();
    });
    expect(screen.getByText("Boundary")).toBeTruthy();
    // Detail is not shown until the row is expanded.
    expect(screen.queryByText(/looks like fetchA/)).toBeNull();

    fireEvent.click(screen.getByTestId("guard-row-src/http-transport.ts"));

    await waitFor(() => {
      expect(screen.getByText(/looks like fetchA/)).toBeTruthy();
    });
    expect(screen.getByText(/looks like fetchB/)).toBeTruthy();
    expect(screen.getByText(/looks like fetchC/)).toBeTruthy();
    expect(screen.getByText(/crosses into ui/)).toBeTruthy();
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
        screen.getByText(
          "Guard is only available in the Prism VS Code / Cursor extension for now.",
        ),
      ).toBeTruthy();
    });
  });
});
