// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { AppSidebar } from "./AppSidebar.js";
import { DASHBOARD_VIEW_LABELS, DASHBOARD_VIEWS } from "./dashboard-views.js";

afterEach(() => {
  cleanup();
});

function renderNav() {
  const client = {} as AppShellClient;
  render(
    <AppShellClientProvider client={client}>
      <AppSidebar
        variant="full"
        active="overview"
        repoLabel="prism"
        onNavigate={() => undefined}
      />
    </AppShellClientProvider>,
  );
}

describe("AppSidebar", () => {
  it("shows the nine Dashboard tabs and no retired products", () => {
    renderNav();

    for (const id of DASHBOARD_VIEWS) {
      expect(
        screen.getByRole("button", { name: DASHBOARD_VIEW_LABELS[id] }),
      ).toBeTruthy();
    }

    expect(screen.queryByRole("button", { name: "Repository Map" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Domains" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Testing and Security" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open Dispatch console" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Guard" })).toBeNull();
  });
});
