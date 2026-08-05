#!/usr/bin/env node
/**
 * `prism` binary (M-028).
 *
 * The only place in the package that calls `process.exit`. Everything else
 * returns an exit code so it can be tested without spawning.
 */

import { processWriter } from "./output.js";
import { main } from "./program.js";

main(process.argv.slice(2), processWriter())
  .then((code) => {
    process.exitCode = code;
  })
  .catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write(`prism: ${message}\n`);
    process.exitCode = 3;
  });
