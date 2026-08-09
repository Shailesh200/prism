import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import { renderCompletions } from "./completions.js";

describe("completions (M-057 P-B8)", () => {
  it("includes every registered command name for bash", () => {
    const names = COMMANDS.map((c) => c.name);
    const script = renderCompletions("bash", names);
    for (const name of names) {
      expect(script).toContain(name);
    }
    expect(script).toContain("complete -F _prism prism");
  });

  it("renders zsh and fish scripts", () => {
    const names = COMMANDS.map((c) => c.name);
    expect(renderCompletions("zsh", names)).toContain("#compdef prism");
    expect(renderCompletions("fish", names)).toContain("complete -c prism");
  });
});
