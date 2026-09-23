import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { ConsoleHubScreen } from "./ConsoleHubScreen.js";

afterEach(() => {
  cleanup();
});

function renderHub(view: "iris" | "skills"): void {
  render(
    <AppShellClientProvider client={{} as AppShellClient}>
      <ConsoleHubScreen
        view={view}
        repoLabel="Prism"
        workspacePath="/Users/me/Prism"
        status={{
          console: {
            url: "http://127.0.0.1:17331/?token=abc",
            port: 17331,
          },
          connectors: [],
          unreadable: [],
        }}
        onNavigate={() => undefined}
        onRetry={() => undefined}
      />
    </AppShellClientProvider>,
  );
}

describe("ConsoleHubScreen", () => {
  it("mounts Iris natively — never an iframe", () => {
    renderHub("iris");
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("heading", { name: "Iris" })).toBeTruthy();
    expect(screen.queryByText(/Dashboard is not running/i)).toBeNull();
    expect(screen.getByRole("heading", { name: "Envelope" })).toBeTruthy();
  });

  it("mounts Skills natively — never an iframe", () => {
    renderHub("skills");
    expect(document.querySelector("iframe")).toBeNull();
  });
});
