import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("./session.js", () => ({
  readToken: () => "",
  getJson: vi.fn(async (path: string) => {
    if (String(path).includes("/api/git-graph")) {
      return {
        commits: [
          {
            sha: "c",
            parents: ["b"],
            refs: ["HEAD -> milestone/M-078"],
            subject: "head",
            at: "2026-01-03T00:00:00.000Z",
          },
          {
            sha: "b",
            parents: ["a"],
            refs: [],
            subject: "mid",
            at: "2026-01-02T00:00:00.000Z",
          },
          {
            sha: "a",
            parents: [],
            refs: [],
            subject: "root",
            at: "2026-01-01T00:00:00.000Z",
          },
        ],
      };
    }
    return {
      repos: [
        {
          path: "/repo",
          label: "prism",
          trees: [
            {
              path: "/repo",
              branch: "milestone/M-078",
              source: "git",
              kind: "primary",
              dirty: true,
              files: 3,
              jobCount: 1,
              jobs: [{ id: "j1", title: "fix trees", status: "done" }],
              jobId: "j1",
              jobTitle: "fix trees",
              jobStatus: "done",
            },
          ],
        },
      ],
    };
  }),
  postJson: vi.fn(),
}));

import { TreesView } from "./trees-view.js";

describe("TreesView", () => {
  it("lists the primary checkout for this workspace", async () => {
    render(<TreesView workspacePath="/repo" repoLabel="prism" />);
    await waitFor(() => {
      expect(screen.getByText("milestone/M-078")).toBeTruthy();
    });
    expect(screen.getByText("prism")).toBeTruthy();
    expect(screen.getByText("Dirty · 3 files")).toBeTruthy();
    expect(screen.getByText("YOU")).toBeTruthy();
    expect(screen.getByText("1 job")).toBeTruthy();
    expect(screen.getByRole("img", { name: /3 commits/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Commit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Push" })).toBeNull();
  });

  it("focuses a commit dot on click and matches the worktree color", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TreesView workspacePath="/repo" repoLabel="prism" />,
    );
    await waitFor(() => {
      expect(screen.getByRole("img", { name: /3 commits/ })).toBeTruthy();
    });
    const card = container.querySelector(".dna-tree") as HTMLElement;
    expect(card.style.getPropertyValue("--dna-tree-color")).toBe("#00c2c2");
    await user.hover(screen.getByRole("button", { name: "b mid" }));
    expect(container.querySelector(".dna-git-tip__subject")?.textContent).toBe(
      "mid",
    );
    expect(card.getAttribute("data-focus")).toBeNull();
    await user.click(screen.getByRole("button", { name: "c head" }));
    const tip = container.querySelector(".dna-git-tip") as HTMLElement;
    expect(tip.querySelector(".dna-git-tip__sha")?.textContent).toBe("c");
    expect(tip.querySelector(".dna-git-tip__subject")?.textContent).toBe(
      "head",
    );
    expect(Number.parseFloat(tip.style.left)).toBeGreaterThan(0);
    expect(Number.parseFloat(tip.style.top)).toBeGreaterThan(0);
    expect(card.getAttribute("data-focus")).toBe("true");
    await user.click(screen.getByRole("button", { name: "b mid" }));
    expect(card.getAttribute("data-focus")).toBe("true");
  });
});
