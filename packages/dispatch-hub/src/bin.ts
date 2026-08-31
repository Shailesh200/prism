#!/usr/bin/env node
import { startHub } from "./server.js";
import { buildStatusline, statuslineSetupSnippet } from "./statusline.js";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const command = process.argv[2];

  // Claude Code statusLine: print one line, exit. Never starts the daemon.
  if (command === "statusline") {
    if (process.argv.includes("--setup")) {
      process.stdout.write(
        `${statuslineSetupSnippet()}\n\nAdd this to ~/.claude/settings.json (merge with any existing keys).\n`,
      );
      return;
    }
    const line = await buildStatusline(await readStdin());
    process.stdout.write(`${line}\n`);
    return;
  }

  const started = await startHub();
  if ("alreadyRunning" in started) {
    process.exit(0);
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`prism-hub: ${detail}\n`);
  process.exit(1);
});
