/**
 * SARIF 2.1.0 emitters for CI code scanning (M-060).
 *
 * `--format sarif` on `review` and `cycles` writes a log GitHub's
 * `codeql-action/upload-sarif` accepts. The Prism JSON envelope is not used —
 * code scanning expects a SARIF root object.
 */

import { PRISM_CORE_VERSION } from "@repo-prism/core";
import {
  PrismErrorCode,
  err,
  ok,
  prismError,
  riskBandDescriptor,
  riskToBand,
  type ChangeReviewReport,
  type PrismError,
  type Result,
  type RiskBand,
} from "@repo-prism/shared";

export const SARIF_VERSION = "2.1.0" as const;
export const SARIF_SCHEMA_URI =
  "https://json.schemastore.org/sarif-2.1.0.json" as const;

const TOOL_NAME = "Prism";
const TOOL_INFORMATION_URI = "https://www.prismhq.in/docs/guides/wire-into-ci";

export type SarifLog = {
  readonly $schema: typeof SARIF_SCHEMA_URI;
  readonly version: typeof SARIF_VERSION;
  readonly runs: readonly SarifRun[];
};

type SarifRun = {
  readonly tool: {
    readonly driver: {
      readonly name: string;
      readonly version: string;
      readonly informationUri: string;
      readonly rules: readonly SarifReportingDescriptor[];
    };
  };
  readonly results: readonly SarifResult[];
};

type SarifReportingDescriptor = {
  readonly id: string;
  readonly shortDescription: { readonly text: string };
  readonly fullDescription: { readonly text: string };
  readonly defaultConfiguration: { readonly level: SarifLevel };
  readonly helpUri: string;
};

type SarifLevel = "error" | "warning" | "note" | "none";

type SarifResult = {
  readonly ruleId: string;
  readonly level: SarifLevel;
  readonly message: { readonly text: string };
  readonly locations?: readonly {
    readonly physicalLocation: {
      readonly artifactLocation: { readonly uri: string };
      readonly region?: { readonly startLine: number };
    };
  }[];
};

const RULES = {
  changeRisk: {
    id: "prism/change-risk",
    shortDescription: { text: "Change blast-radius risk" },
    fullDescription: {
      text: "A changed file's blast-radius risk is at a notable band.",
    },
    defaultConfiguration: { level: "warning" as const },
    helpUri: `${TOOL_INFORMATION_URI}#sarif`,
  },
  importCycle: {
    id: "prism/import-cycle",
    shortDescription: { text: "Import cycle" },
    fullDescription: {
      text: "A cycle of imports or re-exports was detected in the dependency graph.",
    },
    defaultConfiguration: { level: "error" as const },
    helpUri: `${TOOL_INFORMATION_URI}#sarif`,
  },
} as const;

export function parseFormat(
  value: string | undefined,
): Result<"sarif" | undefined, PrismError> {
  if (value === undefined) return ok(undefined);
  const normalized = value.trim().toLowerCase();
  if (normalized === "sarif") return ok("sarif");
  return err(
    prismError(
      PrismErrorCode.VALIDATION,
      `--format expects sarif, got '${value}'`,
    ),
  );
}

function bandLevel(band: RiskBand): SarifLevel {
  if (band === "high") return "error";
  if (band === "mid") return "warning";
  return "note";
}

function driver(rules: readonly SarifReportingDescriptor[]) {
  return {
    name: TOOL_NAME,
    version: PRISM_CORE_VERSION,
    informationUri: TOOL_INFORMATION_URI,
    rules,
  };
}

/** Strip graph prefixes (`file:`, `pkg:`) for artifact URIs. */
export function artifactUri(idOrPath: string): string {
  const colon = idOrPath.indexOf(":");
  if (colon === -1) return idOrPath;
  const prefix = idOrPath.slice(0, colon);
  if (prefix === "file" || prefix === "pkg" || prefix === "symbol") {
    return idOrPath.slice(colon + 1);
  }
  return idOrPath;
}

export function reviewToSarif(review: ChangeReviewReport): SarifLog {
  const results: SarifResult[] = review.items.map((item) => {
    const band = riskToBand(item.risk);
    const descriptor = riskBandDescriptor(item.risk);
    const tests = item.testsLikelyAffected.length;
    return {
      ruleId: RULES.changeRisk.id,
      level: bandLevel(band),
      message: {
        text:
          `${item.path}: ${descriptor.short} risk (${Math.round(item.risk)}/100); ` +
          `${item.affectedFilesCount} affected file${item.affectedFilesCount === 1 ? "" : "s"}` +
          (tests > 0
            ? `; ${tests} test${tests === 1 ? "" : "s"} likely affected`
            : ""),
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: artifactUri(item.path) },
            region: { startLine: 1 },
          },
        },
      ],
    };
  });

  return {
    $schema: SARIF_SCHEMA_URI,
    version: SARIF_VERSION,
    runs: [
      {
        tool: { driver: driver([RULES.changeRisk]) },
        results,
      },
    ],
  };
}

export type CyclesSarifInput = {
  readonly cycles: readonly (readonly string[])[];
  readonly totalCount: number;
};

export function cyclesToSarif(input: CyclesSarifInput): SarifLog {
  const results: SarifResult[] = input.cycles.map((cycle) => {
    const paths = cycle.map(artifactUri);
    const first = paths[0] ?? "(unknown)";
    return {
      ruleId: RULES.importCycle.id,
      level: "error" as const,
      message: {
        text: `Import cycle (${cycle.length} nodes): ${paths.join(" → ")} → ${first}`,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: first },
            region: { startLine: 1 },
          },
        },
      ],
    };
  });

  return {
    $schema: SARIF_SCHEMA_URI,
    version: SARIF_VERSION,
    runs: [
      {
        tool: { driver: driver([RULES.importCycle]) },
        results,
      },
    ],
  };
}
