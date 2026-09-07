import { describe, expect, it } from "vitest";
import { normalizeDir, pickLocalFolder } from "./pick-folder.js";

describe("pickLocalFolder", () => {
  it("returns a POSIX path from the Darwin dialog", async () => {
    const path = await pickLocalFolder("darwin", async () => ({
      stdout: "/Users/dev/Prism/\n",
    }));
    expect(path).toBe("/Users/dev/Prism");
  });

  it("treats a cancelled dialog as no path", async () => {
    const path = await pickLocalFolder("darwin", async () => {
      throw new Error("User canceled.");
    });
    expect(path).toBeUndefined();
  });

  it("drops blank picker output", () => {
    expect(normalizeDir("   ")).toBeUndefined();
    expect(normalizeDir("/tmp/repo/")).toBe("/tmp/repo");
  });

  it("reads Linux and Windows dialogs through the injected runner", async () => {
    expect(
      await pickLocalFolder("linux", async () => ({
        stdout: "/home/dev/app\n",
      })),
    ).toBe("/home/dev/app");
    expect(
      await pickLocalFolder("win32", async () => ({
        stdout: "C:\\Users\\dev\\app\r\n",
      })),
    ).toBe("C:\\Users\\dev\\app");
    expect(
      await pickLocalFolder("freebsd", async () => ({ stdout: "/x" })),
    ).toBe(undefined);
  });
});
