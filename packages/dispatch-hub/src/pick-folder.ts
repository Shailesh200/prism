/**
 * Native folder picker for "Select repository…" in the Console.
 *
 * The browser cannot give us an absolute path (`showDirectoryPicker` is
 * origin-scoped). The hub runs on the user's machine, so it can open the
 * platform dialog and return the POSIX path we then register.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options?: { timeout?: number },
) => Promise<{ stdout: string; stderr?: string }>;

export async function pickLocalFolder(
  platform: NodeJS.Platform = process.platform,
  run: ExecFileFn = async (file, args, options) => {
    const result = await execFileAsync(file, [...args], options);
    return { stdout: String(result.stdout), stderr: String(result.stderr) };
  },
): Promise<string | undefined> {
  try {
    if (platform === "darwin") {
      const { stdout } = await run(
        "osascript",
        [
          "-e",
          'POSIX path of (choose folder with prompt "Select a Prism repository")',
        ],
        { timeout: 300_000 },
      );
      return normalizeDir(stdout);
    }
    if (platform === "linux") {
      const { stdout } = await run(
        "zenity",
        [
          "--file-selection",
          "--directory",
          "--title=Select a Prism repository",
        ],
        { timeout: 300_000 },
      );
      return normalizeDir(stdout);
    }
    if (platform === "win32") {
      const { stdout } = await run(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select a Prism repository'; if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }",
        ],
        { timeout: 300_000 },
      );
      return normalizeDir(stdout);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function normalizeDir(raw: string): string | undefined {
  const path = raw.trim().replace(/[/\\]+$/, "");
  return path.length > 0 ? path : undefined;
}
