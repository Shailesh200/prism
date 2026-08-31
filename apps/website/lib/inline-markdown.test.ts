import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderInlineMarkdown } from "./inline-markdown";

function html(text: string): string {
  return renderToStaticMarkup(createElement("span", null, renderInlineMarkdown(text)));
}

describe("renderInlineMarkdown", () => {
  it("highlights bold, code, and links instead of stripping markers", () => {
    expect(html("**MCP:** progress")).toContain("<strong>MCP:</strong>");
    expect(html("Install `prism`")).toContain("<code>prism</code>");
    expect(html("see [/benchmarks](/benchmarks)")).toContain(
      '<a href="/benchmarks">/benchmarks</a>',
    );
  });

  it("drops javascript: hrefs", () => {
    expect(html("[x](javascript:alert(1))")).toBe("<span>x</span>");
  });
});
