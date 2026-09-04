import { describe, expect, it } from "vitest";
import { createOsNotifier, darwinNotifierArgs } from "./notify.js";

const copy = {
  title: "Test coverage check was cancelled",
  body: "Say where are we in chat if you want to resume.",
};

describe("darwin notification click", () => {
  it("opens the Console URL, never a filesystem path", () => {
    const url = "http://prismhq.localhost:17330/?token=abc";
    const args = darwinNotifierArgs(copy, url);
    expect(args).not.toContain("-open");
    expect(args).toContain("-execute");
    const command = args[args.indexOf("-execute") + 1];
    expect(command).toContain("/usr/bin/open");
    expect(command).toContain(url);
    expect(command).not.toMatch(/\/Users\//);
    expect(command).not.toContain("file://");
  });

  it("ignores a folder path so a click cannot reveal Finder", () => {
    const args = darwinNotifierArgs(copy, "/Users/dev/Prism");
    expect(args).not.toContain("-open");
    expect(args).not.toContain("-execute");
  });

  it("asks terminal-notifier to open the Console", async () => {
    const calls: { cmd: string; args: readonly string[] }[] = [];
    const notify = createOsNotifier("darwin", (async (cmd, args) => {
      calls.push({ cmd, args: args as string[] });
      return { stdout: "", stderr: "" };
    }) as never);
    await notify(copy, "http://prismhq.localhost:17330/?token=tok");
    expect(calls[0]?.cmd).toBe("terminal-notifier");
    expect(calls[0]?.args).toContain("-execute");
    expect(calls[0]?.args.join(" ")).toContain(
      "http://prismhq.localhost:17330/?token=tok",
    );
  });

  it("does not pass a folder to terminal-notifier -open", () => {
    const args = darwinNotifierArgs(copy, "http://prismhq.localhost:17330/");
    expect(args.includes("-open")).toBe(false);
    const execute = args[args.indexOf("-execute") + 1] ?? "";
    expect(execute.startsWith("/usr/bin/open ")).toBe(true);
  });
});
