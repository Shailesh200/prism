// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { TestingSecurityScreen } from "./TestingSecurityScreen.js";

afterEach(() => {
  cleanup();
});

describe("TestingSecurityScreen loading", () => {
  it("shows a shimmer instead of empty copy while reports load", () => {
    const client = {
      fetchTestingReport: () => new Promise(() => {}),
      fetchSecurityReport: () => new Promise(() => {}),
    } as unknown as AppShellClient;
    render(
      <AppShellClientProvider client={client}>
        <TestingSecurityScreen repoLabel="prism" onNavigate={vi.fn()} />
      </AppShellClientProvider>,
    );
    expect(
      screen.getByText("Loading testing and security reports"),
    ).toBeTruthy();
    expect(screen.queryByText("Not analyzed yet.")).toBeNull();
    expect(screen.queryByText("No runners detected.")).toBeNull();
    expect(screen.queryByText("No tools detected.")).toBeNull();
  });
});
