import { describe, expect, it } from "vitest";
import {
  applyParsedUsage,
  mergeTokenUsage,
  parseTokenUsage,
  tokenUsageEqual,
} from "./token-usage.js";

describe("parseTokenUsage", () => {
  it("reads a Claude assistant turn as occupancy plus billed tokens", () => {
    const parsed = parseTokenUsage({
      type: "assistant",
      message: {
        usage: {
          input_tokens: 80,
          output_tokens: 20,
          cache_read_input_tokens: 12_000,
          cache_creation_input_tokens: 400,
        },
      },
    });
    expect(parsed?.source).toBe("turn");
    expect(parsed?.usage).toMatchObject({
      inputTokens: 80,
      outputTokens: 20,
      cacheReadTokens: 12_000,
      cacheWriteTokens: 400,
      contextTokens: 12_480,
    });
  });

  it("reads a Claude result as cumulative totals and a context window", () => {
    const parsed = parseTokenUsage({
      type: "result",
      usage: {
        input_tokens: 51,
        output_tokens: 5555,
        cache_read_input_tokens: 147_615,
        cache_creation_input_tokens: 12_190,
      },
      modelUsage: {
        "claude-sonnet-4-6": {
          inputTokens: 51,
          outputTokens: 5555,
          cacheReadInputTokens: 147_615,
          cacheCreationInputTokens: 12_190,
          contextWindow: 200_000,
        },
      },
    });
    expect(parsed?.source).toBe("cumulative");
    expect(parsed?.usage.inputTokens).toBe(51);
    expect(parsed?.usage.outputTokens).toBe(5555);
    expect(parsed?.usage.contextWindow).toBe(200_000);
    expect(parsed?.usage.contextTokens).toBeUndefined();
  });

  it("reads a Cursor per-turn usage event", () => {
    const parsed = parseTokenUsage({
      type: "usage",
      usage: {
        inputTokens: 1_200,
        outputTokens: 80,
        cacheReadTokens: 40_000,
        cacheWriteTokens: 0,
        totalTokens: 1_280,
      },
    });
    expect(parsed?.source).toBe("turn");
    expect(parsed?.usage.contextTokens).toBe(41_200);
    expect(parsed?.usage.totalTokens).toBe(1_280);
  });

  it("reads cumulative Cursor run.usage on the handle", () => {
    const parsed = parseTokenUsage({
      id: "run-1",
      usage: {
        inputTokens: 9_000,
        outputTokens: 400,
        cacheReadTokens: 80_000,
        cacheWriteTokens: 200,
        totalTokens: 9_400,
      },
    });
    expect(parsed?.source).toBe("cumulative");
    expect(parsed?.usage.inputTokens).toBe(9_000);
    expect(parsed?.usage.contextTokens).toBeUndefined();
  });

  it("ignores events with no usage", () => {
    expect(
      parseTokenUsage({ type: "assistant", message: { content: [] } }),
    ).toBe(undefined);
    expect(
      parseTokenUsage({ type: "tool_call", name: "Read" }),
    ).toBeUndefined();
    expect(parseTokenUsage(null)).toBeUndefined();
  });

  it("unwraps a stream_event envelope", () => {
    const parsed = parseTokenUsage({
      type: "stream_event",
      event: {
        type: "usage",
        inputTokens: 10,
        outputTokens: 2,
      },
    });
    expect(parsed?.source).toBe("turn");
    expect(parsed?.usage.inputTokens).toBe(10);
    expect(parsed?.usage.outputTokens).toBe(2);
  });
});

describe("mergeTokenUsage", () => {
  it("adds turn billed tokens and keeps the latest occupancy", () => {
    const first = parseTokenUsage({
      type: "usage",
      usage: {
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 1_000,
        cacheWriteTokens: 0,
        totalTokens: 110,
      },
    })!;
    const second = parseTokenUsage({
      type: "usage",
      usage: {
        inputTokens: 50,
        outputTokens: 20,
        cacheReadTokens: 4_000,
        cacheWriteTokens: 0,
        totalTokens: 70,
      },
    })!;
    const merged = mergeTokenUsage(first.usage, second);
    expect(merged.inputTokens).toBe(150);
    expect(merged.outputTokens).toBe(30);
    expect(merged.contextTokens).toBe(4_050);
  });

  it("lets a cumulative result replace billed totals without dropping occupancy", () => {
    const live = parseTokenUsage({
      type: "assistant",
      message: {
        usage: {
          input_tokens: 80,
          output_tokens: 20,
          cache_read_input_tokens: 12_000,
          cache_creation_input_tokens: 0,
        },
      },
    })!;
    const result = parseTokenUsage({
      type: "result",
      usage: { input_tokens: 200, output_tokens: 90 },
      modelUsage: { "claude-sonnet-4-6": { contextWindow: 200_000 } },
    })!;
    const merged = mergeTokenUsage(live.usage, result);
    expect(merged.inputTokens).toBe(200);
    expect(merged.outputTokens).toBe(90);
    expect(merged.contextTokens).toBe(12_080);
    expect(merged.contextWindow).toBe(200_000);
  });

  it("does not let a window-only result wipe live billed totals", () => {
    const live = parseTokenUsage({
      type: "assistant",
      message: { usage: { input_tokens: 80, output_tokens: 20 } },
    })!;
    const windowOnly = parseTokenUsage({
      type: "result",
      modelUsage: { "claude-sonnet-4-6": { contextWindow: 200_000 } },
    })!;
    const merged = mergeTokenUsage(live.usage, windowOnly);
    expect(merged.inputTokens).toBe(80);
    expect(merged.outputTokens).toBe(20);
    expect(merged.contextWindow).toBe(200_000);
  });

  it("does not double-count when a cumulative snapshot follows turns", () => {
    const afterTurns = applyParsedUsage(
      applyParsedUsage(undefined, {
        type: "usage",
        usage: {
          inputTokens: 10,
          outputTokens: 2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 12,
        },
      }),
      {
        usage: {
          inputTokens: 10,
          outputTokens: 2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 12,
        },
      },
    );
    expect(afterTurns?.inputTokens).toBe(10);
    expect(tokenUsageEqual(afterTurns, afterTurns)).toBe(true);
  });
});
