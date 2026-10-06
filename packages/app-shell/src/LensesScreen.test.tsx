// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { LensView } from "@repo-prism/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { LensesScreen } from "./LensesScreen.js";

afterEach(() => {
  cleanup();
});

const AT = "2026-10-06T10:00:00.000Z";

const QA: LensView = {
  definition: {
    id: "qa",
    name: "QA",
    role: "Checks proof: whether a test reaches the change.",
    focus: "A claim is true only if a test or a command shows it.",
    tone: "",
    checklist: ["Every changed source file is reached by at least one test."],
    evidence: ["test-impact", "verify-plan"],
    enabled: true,
    seededDefault: true,
  },
  facts: [
    {
      id: "f1",
      lens: "qa",
      text: "Tests run with vitest.",
      origin: "seeded",
      source: "package.json",
      createdAt: AT,
    },
    {
      id: "f2",
      lens: "qa",
      text: "src/legacy is covered by the e2e suite.",
      origin: "learned",
      source: "review r1",
      createdAt: AT,
    },
  ],
  history: [
    {
      id: "r1",
      lens: "qa",
      at: AT,
      subject: "Add a cache to fetchUser",
      evidence: ["tests: no test reaches src/user.ts"],
      verdict: "fail",
      reasoning: "src/user.ts changed and no test reaches it.",
      failedChecks: [
        "Every changed source file is reached by at least one test.",
      ],
      sequential: false,
      override: { at: AT, note: "src/legacy is covered by the e2e suite." },
    },
  ],
};

function renderWith(client: Partial<AppShellClient>) {
  render(
    <AppShellClientProvider client={client as AppShellClient}>
      <LensesScreen repoLabel="prism" branch="main" onNavigate={vi.fn()} />
    </AppShellClientProvider>,
  );
}

describe("LensesScreen", () => {
  it("renders inside the Dashboard shell with the rail", async () => {
    renderWith({ fetchLenses: vi.fn().mockResolvedValue([QA]) });
    expect(screen.getByRole("button", { name: "Overview" })).toBeTruthy();
    const nav = screen.getByRole("button", { name: "Lenses" });
    expect(nav.getAttribute("data-active")).toBe("true");
    expect(
      screen.getByText("Lenses", { selector: ".ov-top__title" }),
    ).toBeTruthy();
  });

  it("shows what an inherited lens is, and keeps memory in the drawer", async () => {
    renderWith({ fetchLenses: vi.fn().mockResolvedValue([QA]) });
    const card = await screen.findByRole("article", { name: "QA" });
    const scope = within(card);
    expect(screen.getByRole("region", { name: "Inherited" })).toBeTruthy();
    expect(scope.getByText("Inherited")).toBeTruthy();
    expect(scope.getByText(/Checks proof/)).toBeTruthy();
    expect(scope.getByText(/reached by at least one test/)).toBeTruthy();
    expect(scope.getByText(/How it works/)).toBeTruthy();
    expect(scope.queryByText("Tests run with vitest.")).toBeNull();

    fireEvent.click(scope.getByRole("button", { name: "Details for QA" }));
    expect(await screen.findByText("Tests run with vitest.")).toBeTruthy();
    expect(screen.getByText("package.json")).toBeTruthy();
    expect(screen.getByText("Learned from your overrides")).toBeTruthy();
    expect(screen.getByText("Fail")).toBeTruthy();
    expect(screen.getByText("Add a cache to fetchUser")).toBeTruthy();
    expect(screen.getByText(/no test reaches it\.$/)).toBeTruthy();
    expect(screen.getByText(/You overruled this/)).toBeTruthy();
    expect(screen.getByText("Evidence it was given (1)")).toBeTruthy();
    expect(screen.getByText(/not hidden model thinking/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Overrule" })).toBeNull();
  });

  it("saves an edited name and remembers an overruled verdict", async () => {
    const fresh = {
      ...QA,
      history: [{ ...QA.history[0]!, override: undefined }],
    };
    const updateLens = vi
      .fn()
      .mockResolvedValue([
        { ...fresh, definition: { ...fresh.definition, name: "Proof" } },
      ]);
    const overrideLensReview = vi.fn().mockResolvedValue([
      {
        ...fresh,
        facts: [
          ...fresh.facts,
          {
            id: "learned",
            lens: "qa",
            text: "The e2e suite covers this.",
            origin: "learned" as const,
            source: "review r1",
            createdAt: AT,
          },
        ],
        history: [
          {
            ...fresh.history[0]!,
            override: { at: AT, note: "The e2e suite covers this." },
          },
        ],
      },
    ]);
    renderWith({
      fetchLenses: vi.fn().mockResolvedValue([fresh]),
      updateLens,
      overrideLensReview,
    });
    const user = userEvent.setup();
    await user.click(
      within(await screen.findByRole("article", { name: "QA" })).getByRole(
        "button",
        { name: "Details for QA" },
      ),
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Proof");
    await user.click(screen.getByRole("button", { name: "Save lens" }));
    await waitFor(() => expect(updateLens).toHaveBeenCalled());
    expect(updateLens.mock.calls[0]?.[0]).toBe("qa");
    expect(updateLens.mock.calls[0]?.[1]).toMatchObject({ name: "Proof" });

    await user.click(screen.getByRole("button", { name: "Overrule" }));
    await user.type(
      screen.getByLabelText("What you decided instead"),
      "The e2e suite covers this.",
    );
    await user.click(screen.getByRole("button", { name: "Remember this" }));
    await waitFor(() => expect(overrideLensReview).toHaveBeenCalled());
    expect(overrideLensReview).toHaveBeenCalledWith(
      "r1",
      "The e2e suite covers this.",
    );
  });

  it("saves a custom lens from the drawer", async () => {
    const saveCustomLens = vi.fn().mockResolvedValue([
      QA,
      {
        ...QA,
        definition: {
          ...QA.definition,
          id: "security",
          name: "Security",
          role: "Checks secrets.",
          focus: "A new secret is a failure.",
          seededDefault: false,
          checklist: ["No new secret is committed."],
          evidence: ["off-limits"],
        },
        facts: [],
        history: [],
      },
    ]);
    renderWith({
      fetchLenses: vi.fn().mockResolvedValue([QA]),
      saveCustomLens,
    });
    await screen.findByRole("article", { name: "QA" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add a lens" }));
    await user.type(await screen.findByLabelText("Name"), "Security");
    await user.type(screen.getByLabelText(/^What it is/), "Checks secrets.");
    await user.type(
      screen.getByLabelText(/^How it judges/),
      "A new secret is a failure.",
    );
    await user.type(
      screen.getByLabelText(/^What it checks/),
      "No new secret is committed.",
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Off-limits paths" }),
    );
    await user.click(screen.getByRole("button", { name: "Add lens" }));
    await waitFor(() => expect(saveCustomLens).toHaveBeenCalled());
    expect(saveCustomLens.mock.calls[0]?.[0]).toMatchObject({
      name: "Security",
      checklist: ["No new secret is committed."],
      evidence: ["off-limits"],
    });
    expect(
      await screen.findByRole("article", { name: "Security" }),
    ).toBeTruthy();
    expect(screen.getByText("Custom", { selector: ".lens-kind" })).toBeTruthy();
  });

  it("shows the host's error instead of an empty page", async () => {
    renderWith({
      fetchLenses: vi
        .fn()
        .mockRejectedValue(new Error("index failed: no git repository")),
    });
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "index failed: no git repository",
      );
    });
  });

  it("says so when the host cannot read lenses", async () => {
    renderWith({});
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /cannot read lenses/,
      );
    });
  });
});
