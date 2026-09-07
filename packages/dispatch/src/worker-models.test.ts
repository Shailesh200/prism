import { describe, expect, it } from "vitest";
import {
  claudePickerFromSettings,
  mergeClaudeModelSources,
  modelsFromAgentList,
  parseClaudeModelHelp,
  requestedWorkerModel,
  pickCursorSpawnModel,
  cursorModelForSpawn,
  listWorkerModels,
} from "./worker-models.js";

describe("requestedWorkerModel", () => {
  it("treats blank as agent default", () => {
    expect(requestedWorkerModel("")).toBeUndefined();
    expect(requestedWorkerModel("   ")).toBeUndefined();
    expect(requestedWorkerModel(undefined)).toBeUndefined();
    expect(requestedWorkerModel("id-from-agent")).toBe("id-from-agent");
  });
});

describe("pickCursorSpawnModel", () => {
  it("keeps an explicit id and otherwise takes the first real row", () => {
    const listed = [
      { id: "auto", label: "Auto" },
      { id: "grok-4.6", label: "Grok 4.6" },
    ];
    expect(pickCursorSpawnModel(listed, "composer-2")).toBe("composer-2");
    expect(pickCursorSpawnModel(listed, "auto")).toBe("grok-4.6");
    expect(pickCursorSpawnModel(listed)).toBe("grok-4.6");
    expect(pickCursorSpawnModel([{ id: "default", label: "Default" }])).toBe(
      undefined,
    );
  });

  it("cursorModelForSpawn lists only when no explicit id", async () => {
    let listed = 0;
    expect(
      await cursorModelForSpawn("composer-2", async () => {
        listed += 1;
        return [{ id: "grok-4.6", label: "Grok" }];
      }),
    ).toBe("composer-2");
    expect(listed).toBe(0);
    expect(
      await cursorModelForSpawn(undefined, async () => {
        listed += 1;
        return [{ id: "grok-4.6", label: "Grok" }];
      }),
    ).toBe("grok-4.6");
    expect(listed).toBe(1);
  });
});

describe("modelsFromAgentList", () => {
  it("keeps the agent's ids and labels, and does not invent extras", () => {
    expect(
      modelsFromAgentList([
        { id: "id-from-agent", displayName: "From agent" },
        { model: "picker-id", label: "Picker row" },
        "plain-id",
        { id: "id-from-agent", displayName: "duplicate" },
        { id: "" },
        3,
      ]),
    ).toEqual([
      { id: "id-from-agent", label: "From agent" },
      { id: "picker-id", label: "Picker row" },
      { id: "plain-id", label: "plain-id" },
    ]);
  });
});

describe("parseClaudeModelHelp", () => {
  it("extracts only quoted --model tokens from this CLI, inventing none", () => {
    const help = `
  --fallback-model <model>              Enable automatic fallback
  --model <model>                       Model for the current session. Provide
                                        an alias for the latest model (e.g.
                                        'fable', 'opus', or 'sonnet') or a
                                        model's full name (e.g.
                                        'claude-fable-5').
  -n, --name <name>                     Set a display name
`;
    const ids = parseClaudeModelHelp(help).map((row) => row.id);
    expect(ids).toEqual(["fable", "opus", "sonnet", "claude-fable-5"]);
    expect(ids).not.toContain("haiku");
  });
});

describe("claudePickerFromSettings", () => {
  it("reads the user's modelPicker rows", () => {
    const parsed = claudePickerFromSettings({
      modelPicker: {
        replaceBuiltInOptions: true,
        options: [{ model: "settings-id", label: "Settings row" }],
      },
      availableModels: ["settings-id", "also-allowed"],
    });
    expect(parsed.replaceBuiltIn).toBe(true);
    expect(parsed.options).toEqual([
      { id: "settings-id", label: "Settings row" },
    ]);
    expect(parsed.availableModels).toEqual(["settings-id", "also-allowed"]);
  });
});

describe("mergeClaudeModelSources", () => {
  it("does not add names that neither help nor settings offered", () => {
    const merged = mergeClaudeModelSources({
      fromHelp: [{ id: "from-help", label: "from-help" }],
      fromPicker: {
        options: [{ id: "from-picker", label: "From picker" }],
        replaceBuiltIn: false,
        availableModels: [],
      },
    });
    expect(merged.map((row) => row.id)).toEqual(["from-help", "from-picker"]);
  });

  it("lets replaceBuiltInOptions hide the help lineup", () => {
    const merged = mergeClaudeModelSources({
      fromHelp: [{ id: "from-help", label: "from-help" }],
      fromPicker: {
        options: [{ id: "from-picker", label: "From picker" }],
        replaceBuiltIn: true,
        availableModels: [],
      },
    });
    expect(merged.map((row) => row.id)).toEqual(["from-picker"]);
  });

  it("filters to availableModels when the agent set an allowlist", () => {
    const merged = mergeClaudeModelSources({
      fromHelp: [
        { id: "kept", label: "kept" },
        { id: "dropped", label: "dropped" },
      ],
      fromPicker: {
        options: [],
        replaceBuiltIn: false,
        availableModels: ["kept"],
      },
    });
    expect(merged.map((row) => row.id)).toEqual(["kept"]);
  });
});

describe("listWorkerModels", () => {
  it("asks the selected backend, not a Prism catalog", async () => {
    const cursor = await listWorkerModels({
      backend: "cursor",
      listCursor: async () => [{ id: "cursor-id", label: "Cursor row" }],
      listClaude: async () => [{ id: "claude-id", label: "Claude row" }],
    });
    expect(cursor).toEqual([{ id: "cursor-id", label: "Cursor row" }]);
    const claude = await listWorkerModels({
      backend: "claude",
      listCursor: async () => [{ id: "cursor-id", label: "Cursor row" }],
      listClaude: async () => [{ id: "claude-id", label: "Claude row" }],
    });
    expect(claude).toEqual([{ id: "claude-id", label: "Claude row" }]);
  });
});
