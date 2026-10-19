import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HabitPair, type Habit } from "../components/site/demos";
import { SiteFooter } from "../components/site/site-footer";
import { SiteNav } from "../components/site/site-nav";
import { Card, FeatureList } from "../components/ui/card";
import { Container } from "../components/ui/container";
import { CopyIcon, ListIcon } from "../components/ui/icons";
import { Typed, cells } from "../components/ui/term";
import { getMDXComponents, withPulseAnchors } from "../components/mdx";
import { AgentLogo } from "../components/ui/agent-logo";
import { Callout } from "../components/ui/callout";
import { CtaBand } from "../components/ui/cta-band";
import { PageHero } from "../components/ui/page-hero";
import { Chip, Pill } from "../components/ui/pill";
import { Table } from "../components/ui/table";
import { Window } from "../components/ui/window";
import {
  CardGrid,
  ExampleRow,
  ProductHero,
  ProductPage,
} from "../components/site/product-page";

vi.mock("../components/ui/star-button", () => ({
  StarButton: () => null,
}));

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children }: { href: string; children?: ReactNode }) =>
      createElement("a", { href }, children),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const habit = (steps: string[], description?: string): Habit => ({
  name: "standup",
  ...(description === undefined ? {} : { description }),
  steps,
  output: "standup",
  agent: "Claude",
  reply: "Three PRs merged.",
});

function html(node: ReactNode): string {
  return renderToStaticMarkup(createElement("div", null, node));
}

describe("site shell", () => {
  it("renders the frame, both window kinds, and a card heading", () => {
    expect(html(createElement(Container, null, "body"))).toContain("wrap");
    expect(html(createElement(CopyIcon))).toContain("<svg");
    expect(html(createElement(ListIcon))).toContain("<svg");
    expect(
      html(createElement(Window, { title: "term", children: "ok" })),
    ).toContain("term");
    expect(
      html(
        createElement(Window, {
          title: "chat",
          kind: "chat",
          children: "ok",
        }),
      ),
    ).toContain("chat");
    expect(
      html(createElement(Card, { title: "Prepare", children: "text" })),
    ).toContain("<h3");
    expect(
      html(
        createElement(Card, {
          title: "Prepare",
          level: 2,
          children: "text",
        }),
      ),
    ).toContain("<h2");
    expect(SiteNav).toBeTypeOf("function");
    expect(SiteFooter).toBeTypeOf("function");
  });

  it("links a feature when it has an href, and leaves the title plain otherwise", () => {
    const linked = html(
      createElement(FeatureList, {
        items: [
          {
            title: "Prepare",
            body: "before you edit",
            href: "/product/prepare",
          },
        ],
      }),
    );
    expect(linked).toContain('href="/product/prepare"');
    const plain = html(
      createElement(FeatureList, {
        items: [{ title: "Prepare", body: "before you edit" }],
      }),
    );
    expect(plain).not.toContain("<a");
  });

  it("types a short command and wraps a long one", () => {
    expect(cells(6, "Files", "3")).toBe("Files   3");
    expect(html(createElement(Typed, { cmd: "prism prepare" }))).toContain(
      "typed",
    );
    const long = `prism habit add ${"x".repeat(80)}`;
    expect(html(createElement(Typed, { cmd: long }))).not.toContain("typed");
  });

  it("notes an unknown habit source and stays quiet for a known one", () => {
    const known = html(
      createElement(HabitPair, {
        habit: habit(["github: PRs merged"]),
      }),
    );
    expect(known).toContain("run my standup habit");
    expect(known).not.toContain("unknown source label");
    const unknown = html(
      createElement(HabitPair, {
        habit: habit(["pager: on call"], "weekday"),
      }),
    );
    expect(unknown).toContain("unknown source label");
  });

  it("renders a hero with and without the aside column", () => {
    const plain = html(
      createElement(PageHero, {
        eyebrow: "Product",
        title: "Prepare",
        lede: "Before you edit",
        actions: "Install",
      }),
    );
    expect(plain).toContain("eyebrow");
    expect(plain).toContain("d1");
    expect(plain).not.toContain("grid2");
    const split = html(
      createElement(PageHero, {
        title: "Prepare",
        aside: "demo",
      }),
    );
    expect(split).toContain("d2");
    expect(split).toContain("grid2");
  });

  it("renders a brand callout and an info callout", () => {
    expect(html(createElement(Callout, { children: "Local." }))).toContain(
      "callout",
    );
    const info = html(
      createElement(Callout, {
        tone: "info",
        title: "Note",
        children: "Stays on this machine.",
      }),
    );
    expect(info).toContain("info");
    expect(info).toContain("Note");
  });

  it("renders the closing band with the default actions and with replacements", () => {
    const band = html(createElement(CtaBand, {}));
    expect(band).toContain("Try it in your repo.");
    expect(band).toContain("Install guide");
    const custom = html(
      createElement(CtaBand, {
        title: "Ship it",
        actions: "Done",
      }),
    );
    expect(custom).toContain("Ship it");
    expect(custom).not.toContain("Install guide");
  });

  it("renders a pill, a verdict chip, and a scrolling table", () => {
    expect(html(createElement(Pill, { children: "Local" }))).toContain(
      'class="pill"',
    );
    expect(
      html(createElement(Pill, { tone: "ok", children: "SHIP" })),
    ).toContain("pill ok");
    expect(
      html(createElement(Chip, { tone: "bad", children: "NO-SHIP" })),
    ).toContain("chip bad");
    expect(
      html(
        createElement(Table, {
          children: createElement("tbody", {
            children: createElement("tr", {
              children: createElement("td", { children: "prepare" }),
            }),
          }),
        }),
      ),
    ).toContain("<table");
  });

  it("wraps a product page and names a known product", () => {
    const page = html(
      createElement(ProductPage, {
        slug: "prepare",
        children: "body",
      }),
    );
    expect(page).toContain("Prepare");
    expect(page).toContain("body");
    const unknown = html(
      createElement(ProductPage, { slug: "nope", children: "body" }),
    );
    expect(unknown).toContain("nope");
    const hero = html(
      createElement(ProductHero, {
        title: "Prepare",
        lede: "Before you edit",
        pair: "demo",
        caption: "A real session",
      }),
    );
    expect(hero).toContain("A real session");
    const row = html(
      createElement(ExampleRow, {
        eyebrow: "Example",
        title: "Review",
        lede: "What it caught",
        children: "pair",
        note: "Local",
      }),
    );
    expect(row).toContain("Example");
    expect(row).toContain("Local");
    expect(html(createElement(CardGrid, { children: "cards" }))).toContain(
      "grid3",
    );
  });

  it("draws an agent mark with and without its name", () => {
    const quiet = html(createElement(AgentLogo, { slug: "cursor" }));
    expect(quiet).toContain("aria-hidden");
    expect(quiet).not.toContain("Cursor logo");
    const named = html(
      createElement(AgentLogo, { slug: "opencode", label: true }),
    );
    expect(named).toContain("opencode logo");
    expect(named).toContain('opacity="0.45"');
  });

  it("tags an install link and renders a docs card as a link or a block", () => {
    const Anchor = withPulseAnchors((props) => createElement("a", props));
    expect(
      html(
        createElement(Anchor, {
          href: "cursor://anysphere.cursor-mcp/install",
          children: "Open",
        }),
      ),
    ).toContain('data-track="install_open"');
    expect(
      html(createElement(Anchor, { href: "/docs", children: "Docs" })),
    ).not.toContain("data-track");

    const Card = getMDXComponents().Card as (props: {
      title: string;
      description?: string;
      href?: string;
      children?: ReactNode;
    }) => ReactNode;
    const linked = html(
      createElement(Card, {
        title: "Install",
        href: "/install",
        description: "One command",
      }),
    );
    expect(linked).toContain('href="/install"');
    expect(linked).toContain("One command");
    const block = html(
      createElement(Card, { title: "Local", children: "On this machine" }),
    );
    expect(block).not.toContain("<a");
    expect(block).toContain("On this machine");
  });
});
