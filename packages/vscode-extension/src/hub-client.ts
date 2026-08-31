import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";

export type HubJobEvent = {
  readonly type: "snapshot" | "job.updated" | "job.finished";
  readonly job?: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly workspacePath: string;
    readonly branch?: string;
    readonly commitSha?: string;
    readonly resultSummary?: string;
    readonly errorMessage?: string;
  };
  readonly jobs?: readonly {
    readonly status: string;
    readonly workspacePath: string;
  }[];
  readonly notice?: string;
};

export type HubRecordFile = {
  readonly port: number;
  readonly token: string;
};

export async function readLocalHubRecord(
  home = join(homedir(), ".prism", "hub"),
): Promise<HubRecordFile | undefined> {
  try {
    const raw = JSON.parse(
      await readFile(join(home, "hub.json"), "utf8"),
    ) as HubRecordFile;
    if (typeof raw.port !== "number" || typeof raw.token !== "string") {
      return undefined;
    }
    return raw;
  } catch {
    return undefined;
  }
}

export function dashboardUrl(record: HubRecordFile): string {
  return `http://127.0.0.1:${record.port}/?token=${encodeURIComponent(record.token)}`;
}

export type HubListener = {
  readonly stop: () => void;
};

/**
 * SSE listener against the local hub. No Dispatch import — HTTP only (ADR-0043).
 */
export function listenHubEvents(
  record: HubRecordFile,
  onEvent: (event: HubJobEvent) => void,
): HubListener {
  let stopped = false;
  let req: ReturnType<typeof httpRequest> | undefined;
  let buffer = "";

  const connect = (): void => {
    if (stopped) return;
    req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: record.port,
        path: `/api/events?token=${encodeURIComponent(record.token)}`,
        method: "GET",
        headers: { Accept: "text/event-stream" },
      },
      (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buffer += chunk;
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part
              .split("\n")
              .find((row) => row.startsWith("data: "));
            if (!line) continue;
            try {
              onEvent(JSON.parse(line.slice(6)) as HubJobEvent);
            } catch {
              /* ignore */
            }
          }
        });
        res.on("end", () => {
          if (!stopped) setTimeout(connect, 2_000).unref?.();
        });
      },
    );
    req.on("error", () => {
      if (!stopped) setTimeout(connect, 2_000).unref?.();
    });
    req.end();
  };

  connect();
  return {
    stop: () => {
      stopped = true;
      req?.destroy();
    },
  };
}

export function runningCount(
  jobs: readonly { readonly status: string }[],
): number {
  return jobs.filter(
    (job) =>
      job.status === "running" ||
      job.status === "booting" ||
      job.status === "ready" ||
      job.status === "waiting_on_you" ||
      job.status === "blocked",
  ).length;
}

export function sameWorkspace(left: string, right: string): boolean {
  const a = left.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const b = right.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return a === b;
}
