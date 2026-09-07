/**
 * Prove the compiled MCP process can load and handshake — the 1.8.0 Cursor
 * `-32000` crash died on `import` before initialize, so unit tests against
 * source never saw it.
 *
 *   bun run scripts/check-mcp-start.mjs
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HANDSHAKE_MS = 20_000;

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "check-mcp-start", version: "0.0.0" },
  },
};

export function mcpDistEntries(root) {
  return {
    hub: join(root, "packages", "dispatch-hub", "dist", "index.js"),
    server: join(root, "packages", "mcp-server", "dist", "server.js"),
    bin: join(root, "packages", "mcp-server", "dist", "bin.js"),
  };
}

export async function assertMcpGraphLoads(root) {
  const entries = mcpDistEntries(root);
  for (const [name, file] of Object.entries(entries)) {
    if (!existsSync(file)) {
      throw new Error(`missing ${name} at ${file} — run bun run build first`);
    }
  }
  // bin.js starts the process; load the same import graph Cursor hits first.
  await import(pathToFileURL(entries.hub).href);
  await import(pathToFileURL(entries.server).href);
}

function readJsonLines(buffer) {
  const messages = [];
  let rest = buffer;
  while (true) {
    const index = rest.indexOf("\n");
    if (index === -1) break;
    const line = rest.slice(0, index).replace(/\r$/, "").trim();
    rest = rest.slice(index + 1);
    if (!line) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      throw new Error(`MCP stdout was not JSON-RPC: ${line.slice(0, 200)}`);
    }
  }
  return { messages, rest };
}

export function initializeResult(messages) {
  return messages.find(
    (message) =>
      message &&
      message.id === 1 &&
      message.result &&
      message.result.serverInfo,
  );
}

export async function handshakeMcp(root, options = {}) {
  const { bin } = mcpDistEntries(root);
  const child = spawn(process.execPath, [bin], {
    env: {
      ...process.env,
      PRISM_SKIP_SELF_UPDATE: "1",
      PRISM_WORKSPACE: options.workspace ?? root,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.stdin.write(`${JSON.stringify(INITIALIZE)}\n`);

  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `MCP did not initialize within ${HANDSHAKE_MS}ms.\nstderr:\n${stderr}\nstdout:\n${stdout}`,
          ),
        );
      }, HANDSHAKE_MS);

      const fail = (cause) => {
        clearTimeout(timer);
        reject(cause);
      };

      child.once("error", fail);
      const onExit = (code, signal) => {
        fail(
          new Error(
            `MCP exited before initialize (code ${code}, signal ${signal}).\nstderr:\n${stderr}\nstdout:\n${stdout}`,
          ),
        );
      };
      child.once("exit", onExit);

      const onData = () => {
        try {
          const { messages } = readJsonLines(stdout);
          const found = initializeResult(messages);
          if (found) {
            clearTimeout(timer);
            child.stdout.off("data", onData);
            child.off("exit", onExit);
            resolve(found.result);
          }
        } catch (cause) {
          fail(cause);
        }
      };
      child.stdout.on("data", onData);
      onData();
    });

    const name = result.serverInfo?.name;
    if (name !== "prism") {
      throw new Error(`expected serverInfo.name 'prism', got ${name}`);
    }
    return result;
  } finally {
    child.kill("SIGTERM");
  }
}

export async function assertMcpStarts(root) {
  await assertMcpGraphLoads(root);
  await handshakeMcp(root);
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    await assertMcpStarts(root);
    console.log("check-mcp-start: compiled MCP loaded and initialized");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`check-mcp-start: ${message}`);
    process.exit(1);
  }
}
