import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { JobNoticeCopy } from "./notice.js";

const execFileAsync = promisify(execFile);

export type NotifyFn = (copy: JobNoticeCopy, url?: string) => Promise<void>;

export function createOsNotifier(
  platform: NodeJS.Platform = process.platform,
  run: typeof execFileAsync = execFileAsync,
): NotifyFn {
  return async (copy, url) => {
    try {
      if (platform === "darwin") {
        if (run === execFileAsync && notifyDarwinHelper(copy, url)) {
          return;
        }
        await notifyDarwin(copy, url, run);
        return;
      }
      if (platform === "linux") {
        await run("notify-send", [copy.title, copy.body], { timeout: 4_000 });
        return;
      }
      if (platform === "win32") {
        await notifyWindows(copy, run);
      }
    } catch {
      /* notifications are best-effort */
    }
  };
}

/**
 * `terminal-notifier -open` is for files. An HTTP Console URL handed to it
 * is treated as a relative path, so the click reveals Finder instead of the
 * dashboard. `-execute /usr/bin/open <url>` opens the browser.
 */
export function darwinNotifierArgs(
  copy: JobNoticeCopy,
  url?: string,
): string[] {
  const args = [
    "-title",
    "Prism",
    "-message",
    copy.body,
    "-subtitle",
    copy.title,
  ];
  const consoleUrl = httpConsoleUrl(url);
  if (consoleUrl) {
    args.push("-execute", `/usr/bin/open ${JSON.stringify(consoleUrl)}`);
  }
  return args;
}

async function notifyDarwin(
  copy: JobNoticeCopy,
  url: string | undefined,
  run: typeof execFileAsync,
): Promise<void> {
  try {
    await run("terminal-notifier", darwinNotifierArgs(copy, url), {
      timeout: 4_000,
    });
    return;
  } catch {
    /* fall through to osascript */
  }
  const script = `display notification ${osa(copy.body)} with title "Prism" subtitle ${osa(copy.title)}`;
  await run("osascript", ["-e", script], { timeout: 4_000 });
}

function darwinNotifyHelperPath(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  const here = dirname(fileURLToPath(import.meta.url));
  const app = join(here, "Prism.app");
  const bin = join(app, "Contents", "MacOS", "prism-notify");
  return existsSync(bin) ? app : undefined;
}

function notifyDarwinHelper(
  copy: JobNoticeCopy,
  url: string | undefined,
): boolean {
  const app = darwinNotifyHelperPath();
  if (!app) return false;
  try {
    const child = spawn(
      "/usr/bin/open",
      [
        "-n",
        "-g",
        app,
        "--args",
        copy.title,
        copy.body,
        httpConsoleUrl(url) ?? "",
      ],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function httpConsoleUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

async function notifyWindows(
  copy: JobNoticeCopy,
  run: typeof execFileAsync,
): Promise<void> {
  const title = ps(copy.title);
  const body = ps(copy.body);
  const script = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; Write-Output ${title}; Write-Output ${body}`;
  await run("powershell", ["-NoProfile", "-Command", script], {
    timeout: 6_000,
  });
}

function osa(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function ps(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
