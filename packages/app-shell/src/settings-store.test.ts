import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  saveSettings,
} from "./settings-store.js";

describe("settings-store defaults (M-057 P-B1)", () => {
  afterEach(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  it("defaults autoReindex to on and maxFileSize to 5mb", () => {
    expect(DEFAULT_SETTINGS.autoReindex).toBe(true);
    expect(DEFAULT_SETTINGS.maxFileSize).toBe("5mb");
  });

  it("loadSettings returns the product defaults when storage is empty", () => {
    const loaded = loadSettings();
    expect(loaded.autoReindex).toBe(true);
    expect(loaded.maxFileSize).toBe("5mb");
  });

  it("preserves an explicit autoReindex false from storage", () => {
    saveSettings({ autoReindex: false });
    expect(loadSettings().autoReindex).toBe(false);
  });
});
