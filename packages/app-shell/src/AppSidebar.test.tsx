// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { AppSidebar } from "./AppSidebar.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderNav() {
  const client = {
    fetchConsoleStatus: vi.fn().mockResolvedValue({
      console: {
        url: "http://prismhq.localhost:17330/?token=abc",
        port: 17330,
      },
      connectors: [],
      unreadable: [],
    }),
  } as unknown as AppShellClient;
  render(
    <AppShellClientProvider client={client}>
      <AppSidebar
        variant="full"
        active="testing"
        repoLabel="prism"
        onNavigate={vi.fn()}
      />
    </AppShellClientProvider>,
  );
  return client;
}

describe("AppSidebar", () => {
  it("keeps Impact under Tools and opens Dispatch in a new tab", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const client = renderNav();

    expect(screen.queryByRole("button", { name: "Jobs" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change Review" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Explain This Area" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Blast Radius" })).toBeNull();
    expect(screen.getByRole("button", { name: "Impact" })).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Open Dispatch console" }),
    );
    expect(client.fetchConsoleStatus).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(
      "http://prismhq.localhost:17330/?token=abc",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
