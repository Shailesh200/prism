/**
 * Generic worker backend (M-073). Uses the agent registry to spawn any
 * registered agent dynamically. Implements the same `WorkerPort` contract
 * as the Cursor and Claude backends.
 *
 * For agents that share the same CLI interface as Claude (e.g., agents
 * that wrap `claude -p`), this delegates to the Claude worker child.
 * For truly custom agents, it spawns a plain CLI process.
 */

import { spawn } from "node:child_process";
import type { AgentRegistry } from "./agent-registry.js";
import type { AgentConfig } from "./agent-registry.js";
import { cancelWorkerRun, workerRunStatus } from "./worker-spawn.js";
import type { WorkerPort, WorkerStartInput } from "./worker.js";

/**
 * Create a generic WorkerPort that spawns any registered agent.
 *
 * If the agent has a known worker child (cursor, claude), delegates
 * to the appropriate specialized port. Otherwise, spawns the agent's
 * CLI directly.
 */
export function createGenericWorkerPort(
  registry: AgentRegistry,
  fallbacks: {
    cursor?: WorkerPort;
    claude?: WorkerPort;
  } = {},
): WorkerPort {
  return {
    async start(input) {
      const agent = registry.get(input.name ?? "");
      if (!agent) {
        throw new Error(
          `Agent "${input.name}" not found in registry. ` +
            `Available: ${registry.names().join(", ")}`,
        );
      }

      // Delegate to known specialized workers for built-in agents
      if (agent.config.name === "cursor" && fallbacks.cursor) {
        return fallbacks.cursor.start(input);
      }
      if (agent.config.name === "claude" && fallbacks.claude) {
        return fallbacks.claude.start(input);
      }

      // Generic: spawn the agent's CLI
      return spawnGenericAgent(agent.config, input);
    },

    async resume(input) {
      const agent = registry.get(input.name ?? "");
      if (!agent) {
        throw new Error(
          `Agent "${input.name}" not found in registry. ` +
            `Available: ${registry.names().join(", ")}`,
        );
      }

      // Delegate to known specialized workers
      if (agent.config.name === "cursor" && fallbacks.cursor) {
        return fallbacks.cursor.resume(input);
      }
      if (agent.config.name === "claude" && fallbacks.claude) {
        return fallbacks.claude.resume(input);
      }

      // Generic resume: spawn with resume flag
      return spawnGenericAgent(agent.config, {
        ...input,
        prompt: input.prompt ?? "Continue.",
        resumeAgentId: input.agentId,
      });
    },

    async cancel(input) {
      await cancelWorkerRun({
        ...(typeof input.pid === "number" ? { pid: input.pid } : {}),
        ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
      });
    },

    async status(input) {
      return workerRunStatus({
        ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
      });
    },
  };
}

type SpawnInput = WorkerStartInput & {
  resumeAgentId?: string;
};

/**
 * Spawn a generic agent CLI. Builds the command line from the agent's
 * registry config and spawns it as a child process.
 */
async function spawnGenericAgent(
  agent: AgentConfig,
  input: SpawnInput,
): Promise<{ pid?: number }> {
  const args: string[] = [];

  // Add output format flag if configured
  if (agent.flags.outputFormat && agent.flags.outputFormatValue) {
    args.push(agent.flags.outputFormat, agent.flags.outputFormatValue);
  }

  // Add verbose flag
  if (agent.flags.verbose) {
    args.push(agent.flags.verbose);
  }

  // Add resume flag if resuming
  if (input.resumeAgentId && agent.flags.resume) {
    args.push(agent.flags.resume, input.resumeAgentId);
  }

  // Add extra flags
  if (agent.flags.extra?.length) {
    args.push(...agent.flags.extra);
  }

  // Add prompt flag and prompt
  if (agent.flags.prompt) {
    args.push(agent.flags.prompt, input.prompt);
  }

  // Spawn the process
  const child = spawn(agent.cli, args, {
    cwd: input.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(input.mcpCommand ? { PRISM_MCP_COMMAND: input.mcpCommand } : {}),
    },
  });

  // Write prompt to stdin if the agent reads from stdin
  if (agent.flags.prompt === "-p" || agent.flags.prompt === "--stdin") {
    child.stdin.write(input.prompt);
    child.stdin.end();
  }

  const pid = child.pid;
  return pid != null ? { pid } : {};
}
