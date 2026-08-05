import type { ConsentPurposeId, ConsentState } from "@repo-prism/shared";
import { CONSENT_PURPOSES } from "@repo-prism/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "./Avatar.js";
import type { AppShellClient } from "./client.js";
import { refreshConsent } from "./consent-state.js";

/**
 * The avatar is the smallest component in the shell and was, before M-036, the
 * one that leaked: it sent a hash of every committer's email to gravatar.com
 * on render, behind no toggle. These tests exist to keep that from coming back
 * by accident, so they assert on the absence of a request as much as on what
 * is drawn.
 */

function states(granted: readonly ConsentPurposeId[]): ConsentState[] {
  return CONSENT_PURPOSES.map((purpose) => ({
    purpose,
    granted: granted.includes(purpose.id),
    decidedAt: granted.includes(purpose.id) ? new Date().toISOString() : null,
  }));
}

async function withConsent(granted: readonly ConsentPurposeId[]) {
  const client = {
    listConsent: async () => states(granted),
    setConsent: async () => states(granted),
  } as unknown as AppShellClient;
  await refreshConsent(client);
}

afterEach(async () => {
  await withConsent([]);
});

describe("without gravatar consent", () => {
  it("draws initials and issues no request", async () => {
    await withConsent([]);
    const { container } = render(
      <Avatar name="Ada Lovelace" email="ada@example.com" />,
    );

    expect(screen.getByText("AL")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("still renders when the author has no email at all", async () => {
    await withConsent([]);
    render(<Avatar name="Grace Hopper" />);

    expect(screen.getByText("GH")).toBeTruthy();
  });

  it("labels itself for screen readers with the author's name", async () => {
    await withConsent([]);
    render(<Avatar name="Ada Lovelace" email="ada@example.com" />);

    // The initials alone ("AL") tell an assistive-technology user nothing.
    expect(screen.getByLabelText("Ada Lovelace")).toBeTruthy();
  });
});

describe("with gravatar consent", () => {
  it("loads the photo, and only then", async () => {
    await withConsent(["network.gravatar"]);
    const { container } = render(
      <Avatar name="Ada Lovelace" email="ada@example.com" />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("gravatar.com");
  });

  it("marks the photo decorative so the name is not announced twice", async () => {
    await withConsent(["network.gravatar"]);
    const { container } = render(
      <Avatar name="Ada Lovelace" email="ada@example.com" />,
    );

    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("has nothing to fetch when there is no email", async () => {
    await withConsent(["network.gravatar"]);
    const { container } = render(<Avatar name="Grace Hopper" />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("GH")).toBeTruthy();
  });
});

describe("appearance", () => {
  it("gives the same person the same colours every time", async () => {
    await withConsent([]);
    const first = render(<Avatar name="Ada" email="ada@example.com" />);
    const a = first.container.querySelector(".ov-avatar") as HTMLElement;
    const gradient = a.style.backgroundImage;
    first.unmount();

    const second = render(<Avatar name="Ada" email="ada@example.com" />);
    const b = second.container.querySelector(".ov-avatar") as HTMLElement;

    // A colour that changes between renders reads as a different person.
    expect(b.style.backgroundImage).toBe(gradient);
    expect(gradient.length).toBeGreaterThan(0);
  });

  it("honours the requested size", async () => {
    await withConsent([]);
    const { container } = render(<Avatar name="Ada" size={48} />);
    const el = container.querySelector(".ov-avatar") as HTMLElement;

    expect(el.style.width).toBe("48px");
    expect(el.style.height).toBe("48px");
  });
});
