/** JSON prepare-history returns — kept here so the Dashboard does not import Dispatch. */

export type LastPrepareSummary = {
  readonly workspace: string;
  readonly task: string;
  readonly generatedAt: string;
  readonly packFiles: readonly {
    readonly path: string;
    readonly symbols: readonly string[];
    readonly why: readonly string[];
    readonly tokenWeight: number;
    readonly provenance: string;
  }[];
  readonly reuse: readonly {
    readonly symbol: string;
    readonly path: string;
    readonly kind: string;
    readonly score: number;
    readonly evidence: string;
    readonly provenance: string;
  }[];
  readonly conventions: readonly {
    readonly path: string;
    readonly patternId: string;
    readonly whyCanonical: string;
  }[];
  readonly ambiguous: {
    readonly query: string;
    readonly candidates: readonly {
      readonly path: string;
      readonly symbol: string;
    }[];
  } | null;
  readonly truncated: boolean;
  readonly totalCount: number;
  readonly order?: unknown;
};
