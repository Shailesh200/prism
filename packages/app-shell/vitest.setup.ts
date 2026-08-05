import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

/**
 * Node 26 defines its own `localStorage` global, which is unavailable unless
 * the process was started with `--localstorage-file`. Under vitest's jsdom
 * environment `window` *is* `globalThis`, so that broken global sits where
 * jsdom's Storage would be and every settings-backed component quietly takes
 * its "no storage" path — which would make these tests agree with each other
 * while disagreeing with the browser.
 *
 * Replace it with a plain in-memory Storage.
 */
function installStorage(): void {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(String(key)) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(String(key));
    },
    setItem: (key, value) => {
      entries.set(String(key), String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });
}

installStorage();

// Components are mounted into a shared document. Without this, a query in one
// test can match a node another test left behind, and the failure shows up
// somewhere unrelated.
afterEach(() => {
  cleanup();
});

// Leaking settings between tests makes order matter, which is how a suite
// starts passing only when run whole.
beforeEach(() => {
  globalThis.localStorage.clear();
});
