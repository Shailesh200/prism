import { describe, expect, it } from "vitest";
import { classifyPrompt, isNonEnglish } from "./classify-prompt.js";

const kind = (text: string) => classifyPrompt(text).kind;

describe("classifyPrompt (plan §5.8, §5.11)", () => {
  it("HK-1/HK-3: change verbs and symptoms get a pack", () => {
    expect(kind("fix the due date on the tenant dashboard")).toBe("change");
    expect(
      kind(
        "the tenant dashboard shows next month instead of this one on the due day",
      ),
    ).toBe("change");
    expect(kind("checkout crashes when the cart is empty")).toBe("change");
    expect(kind("why does parseBody throw sometimes? fix it")).toBe("change");
    expect(kind("can we show a loading spinner while the upload runs")).toBe(
      "change",
    );
    expect(kind("the cors middleware should accept an options object")).toBe(
      "change",
    );
  });

  it("HK-2: pure questions get no pack", () => {
    expect(kind("how does src/hono.ts reach src/compose.ts?")).toBe("question");
    expect(kind("what would break if I changed formatDate?")).toBe("question");
    expect(kind("can you explain the router?")).toBe("question");
    expect(kind("okay, implementing this will lower the cost per job?")).toBe(
      "question",
    );
  });

  it("review requests go to the review path", () => {
    expect(kind("review my changes before I open a PR")).toBe("review");
    expect(kind("is this change to debounce safe to merge?")).toBe("review");
  });

  it("acknowledgements are chit-chat, a go-ahead with an object is a change", () => {
    expect(kind("thanks!")).toBe("chitchat");
    expect(kind("Yes, go ahead")).toBe("chitchat");
    expect(kind("continue")).toBe("chitchat");
    expect(kind("go ahead with phase 2")).toBe("change");
    expect(kind("do 1 & 2")).toBe("change");
  });

  it("HK-4: non-English prompts are recognised, in any script", () => {
    expect(kind("डैशबोर्ड पर due date गलत दिख रही है, ठीक करो")).toBe(
      "non_english",
    );
    expect(kind("behebe den Fehler in the etag middleware")).toBe(
      "non_english",
    );
    expect(kind("ajoute une option de délai à debounce")).toBe("non_english");
    expect(kind("the tenant dashboard ko theek karo")).toBe("non_english");
    expect(isNonEnglish("add a retry option to es-toolkit debounce")).toBe(
      false,
    );
    expect(isNonEnglish("fix `der` in src/die/das.ts")).toBe(false);
  });

  it("ignores words inside code when judging the language", () => {
    expect(kind("fix the bug in ```\nle code est cassé\n``` please")).toBe(
      "change",
    );
  });
});
