import type { AuditDiagnostic } from "../audit-log.js";
import { withAudit } from "../audit-log.js";
import {
  createHttpTransport,
  httpFetchDna,
  httpFetchHealth,
  httpFetchPresets,
} from "./http-transport.js";
import { createPrismClient, type PrismClient } from "./prism-client.js";

export type PlaygroundPreset = {
  id: string;
  label: string;
  root: string;
};

export type PlaygroundPresets = {
  defaultRoot: string;
  presets: PlaygroundPreset[];
};

/** Bound PrismClient for a playground workspace root. */
export function createPlaygroundClient(root: string | null): PrismClient {
  return createPrismClient(
    createHttpTransport({
      getRoot: () => root,
    }),
  );
}

export async function fetchPresets(): Promise<PlaygroundPresets | null> {
  return httpFetchPresets();
}

/** Repository health score + factors (Core `getHealth`) — playground overview. */
export async function fetchHealth(
  root: string | null,
): Promise<import("@repo-prism/shared").HealthScore | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "analysis",
      operation: "Computed health score",
      target,
      command: `GET /api/health?root=${encodeURIComponent(target)}`,
    },
    async () => httpFetchHealth(() => root),
    (data) => {
      if (!data) {
        return { status: "error", output: "Health score unavailable." };
      }
      const diagnostics: AuditDiagnostic[] = data.factors
        .filter((f) => f.note || f.score < 60)
        .map((f) => ({
          severity: (f.score < 40
            ? "error"
            : f.score < 60
              ? "warning"
              : "info") as "error" | "warning" | "info",
          message: `${f.label}: ${Math.round(f.score)}`,
          ...(f.note ? { fix: f.note } : {}),
        }));
      const lines = [
        `score=${Math.round(data.score)} grade=${data.grade}`,
        ...data.factors.map(
          (f) =>
            `  ${f.id}=${Math.round(f.score)}${f.note ? ` — ${f.note}` : ""}`,
        ),
      ];
      return {
        status: data.score < 40 ? "warning" : "success",
        output: lines.join("\n"),
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      };
    },
  );
}

/** Codebase DNA — playground overview. */
export async function fetchDna(
  root: string | null,
): Promise<import("@repo-prism/shared").DnaReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "analysis",
      operation: "Computed codebase DNA",
      target,
      command: `GET /api/dna?root=${encodeURIComponent(target)}`,
    },
    async () => httpFetchDna(() => root),
    (data) => {
      if (!data) {
        return { status: "error", output: "DNA report unavailable." };
      }
      const langs = data.languages.length;
      const frameworks = data.frameworks.length;
      const packages = data.stack?.packages?.length ?? 0;
      return {
        status: "success",
        output: [
          `languages=${langs}`,
          `frameworks=${frameworks}`,
          `packages=${packages}`,
          data.summary,
        ].join("\n"),
      };
    },
  );
}
