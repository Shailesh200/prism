import { describe, expect, it } from "vitest";
import { loopbackPageHtml } from "./loopback-page.js";

describe("loopback callback page", () => {
  it("uses Prism dark tokens on the success page", () => {
    const html = loopbackPageHtml("success");
    expect(html).toContain("Prism Dispatch is connected");
    expect(html).toContain("You can close this tab");
    expect(html).toContain("#00c2c2");
    expect(html).toContain("#0a0e1a");
    expect(html).toContain("#131926");
  });

  it("escapes error detail from the query string", () => {
    const html = loopbackPageHtml("error", `<script>alert(1)</script>`);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Connection did not finish");
  });
});
