#!/usr/bin/env node
import { startHub } from "./server.js";

async function main(): Promise<void> {
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
