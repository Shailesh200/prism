// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NO_CONSOLE_STATUS,
  PRISM_TOOL_COUNT,
  type ConsoleStatus,
} from "@repo-prism/shared";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import {
  IntegrationsScreen,
  type IntegrationsScreenProps,
} from "./IntegrationsScreen.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderScreen(
  status: ConsoleStatus,
  props: Partial<IntegrationsScreenProps> = {},
) {
  const client = {
    fetchConsoleStatus: vi.fn().mockResolvedValue(status),
  } as unknown as AppShellClient;
  render(
    <AppShellClientProvider client={client}>
      <IntegrationsScreen
        repoLabel="prism"
        networkIntegrationsAllowed={false}
        onNavigate={vi.fn()}
        {...props}
      />
    </AppShellClientProvider>,
  );
  return client;
}

const LIVE: ConsoleStatus = {
  console: { url: "http://prismhq.localhost:17330/?token=abc", port: 17330 },
  version: "1.2.0",
  workspaces: 3,
  connectors: [
    {
      id: "slack",
      label: "Slack",
      description: "Send and search messages",
      hosts: ["cursor"],
      skills: ["slack-search", "slack-messaging"],
      transport: "http",
      source: "~/.cursor/plugins",
    },
  ],
  unreadable: [],
};

describe("IntegrationsScreen — MCP runtime", () => {
  it("shows live Console state instead of only an install command", async () => {
    renderScreen(LIVE);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /manage|show/i }))[0]!,
    );

    expect(await screen.findByText(/Connected on port 17330/)).toBeTruthy();
    expect(screen.getByText(`${PRISM_TOOL_COUNT}`)).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("says the Console is not running rather than showing a blank card", async () => {
    renderScreen(NO_CONSOLE_STATUS);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /manage|show/i }))[0]!,
    );
    expect(await screen.findByText(/Console not running/)).toBeTruthy();
  });
});

describe("IntegrationsScreen — host connectors", () => {
  it("lists what the agent window has connected", async () => {
    renderScreen(LIVE);
    expect(await screen.findByText("Host connectors")).toBeTruthy();
    expect(screen.getByText("Slack")).toBeTruthy();
    expect(screen.getByText("Cursor")).toBeTruthy();
    expect(screen.getByText(/2 skills/)).toBeTruthy();
  });

  it("says none found rather than hiding the section", async () => {
    renderScreen({ ...LIVE, connectors: [] });
    expect(await screen.findByText(/None found/)).toBeTruthy();
  });

  it("admits when a location could not be read", async () => {
    renderScreen({
      ...LIVE,
      unreadable: [{ path: "~/.claude.json", detail: "bad json" }],
    });
    // A partial list presented as complete is the failure worth catching:
    // "no Slack" and "could not tell" are different answers.
    expect(await screen.findByText(/may be incomplete/)).toBeTruthy();
  });

  it("stays hidden while the Console is unknown", () => {
    const client = {
      fetchConsoleStatus: vi.fn(() => new Promise<ConsoleStatus>(() => {})),
    } as unknown as AppShellClient;
    render(
      <AppShellClientProvider client={client}>
        <IntegrationsScreen
          repoLabel="prism"
          networkIntegrationsAllowed={false}
          onNavigate={vi.fn()}
        />
      </AppShellClientProvider>,
    );
    expect(screen.queryByText("Host connectors")).toBeNull();
  });
});

describe("IntegrationsScreen — MCP install parity", () => {
  it("offers the same Cursor config the docs and website do", async () => {
    renderScreen(LIVE);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /manage|show/i }))[0]!,
    );
    const link = (await screen.findByRole("link", {
      name: /Add to Cursor/i,
    })) as HTMLAnchorElement;

    // The deeplink carries a base64 config. Workspace resolution runs through
    // MCP roots (with retry + roots/list_changed), so the config must NOT pin
    // CURSOR_WORKSPACE — it stays byte-identical to mcp-install.json.
    const config = new URL(link.href).searchParams.get("config") ?? "";
    const decoded = JSON.parse(atob(config)) as {
      env: Record<string, string>;
    };
    expect(decoded.env).toEqual({ NODE_USE_SYSTEM_CA: "1" });
  });
});
