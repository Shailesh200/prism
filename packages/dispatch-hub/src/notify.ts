import { execFile } from "node:child_process";
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

async function notifyDarwin(
  copy: JobNoticeCopy,
  url: string | undefined,
  run: typeof execFileAsync,
): Promise<void> {
  try {
    const args = [
      "-title",
      "Prism",
      "-message",
      copy.body,
      "-subtitle",
      copy.title,
    ];
    if (url) args.push("-open", url);
    await run("terminal-notifier", args, { timeout: 4_000 });
    return;
  } catch {
    /* fall through to osascript */
  }
  const script = `display notification ${osa(copy.body)} with title "Prism" subtitle ${osa(copy.title)}`;
  await run("osascript", ["-e", script], { timeout: 4_000 });
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
