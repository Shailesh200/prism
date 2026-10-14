/**
 * Restore the host configs `dev:link` backed up. Pass a backup folder name,
 * or it uses the newest one under ~/.prism/backup.
 */

import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const root = join(homedir(), ".prism", "backup");
const names = existsSync(root)
  ? readdirSync(root).filter((name) =>
      existsSync(join(root, name, "README.txt")),
    )
  : [];
const stamp = process.argv[2] ?? names.sort().at(-1);
if (!stamp) {
  console.error("dev:unlink: no backup found");
  process.exit(1);
}
const backup = join(root, stamp);
const homeCopy = join(backup, "home");
if (existsSync(homeCopy)) {
  cpSync(homeCopy, homedir(), { recursive: true });
  console.log(`dev:unlink: restored files from ${stamp}`);
}
const previous = join(backup, "plugin-previous");
if (existsSync(previous)) {
  const installed = join(
    homedir(),
    ".claude",
    "plugins",
    "installed_plugins.json",
  );
  const parsed = JSON.parse(readFileSync(installed, "utf8"));
  const installPath = parsed.plugins?.["prism@local"]?.[0]?.installPath;
  if (installPath) {
    if (existsSync(installPath))
      rmSync(installPath, { recursive: true, force: true });
    renameSync(previous, installPath);
    console.log(`dev:unlink: restored plugin cache to ${installPath}`);
  }
}
const extensions = join(backup, "extensions");
if (existsSync(extensions)) {
  for (const name of readdirSync(extensions)) {
    const dest = join(homedir(), ".cursor", "extensions", name);
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    renameSync(join(extensions, name), dest);
    console.log(`dev:unlink: restored extension ${name}`);
  }
}
