/**
 * Darwin-only: a tiny bundled helper so notification clicks open the Console.
 *
 * `terminal-notifier` is often missing, and `osascript display notification`
 * has no click URL — macOS then activates Finder. This helper posts as
 * "Prism" and opens the HTTP dashboard on click.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "dist", "Prism.app");
const macOS = join(app, "Contents", "MacOS");
const bin = join(macOS, "prism-notify");
const source = join(root, "scripts", "prism-notify.m");

if (process.platform !== "darwin") {
  process.exit(0);
}

mkdirSync(macOS, { recursive: true });
writeFileSync(
  join(app, "Contents", "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>prism-notify</string>
  <key>CFBundleIdentifier</key>
  <string>in.prismhq.notify</string>
  <key>CFBundleName</key>
  <string>Prism</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`,
);

execFileSync(
  "clang",
  [
    "-fobjc-arc",
    "-Wno-deprecated-declarations",
    "-framework",
    "Foundation",
    "-framework",
    "AppKit",
    "-o",
    bin,
    source,
  ],
  { stdio: "inherit" },
);
