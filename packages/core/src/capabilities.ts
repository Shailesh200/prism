/**
 * Feature flags advertised by this Core build.
 * Real engines flip these on as milestones land.
 */
export type PrismCapabilities = {
  readonly indexing: boolean;
  readonly analysis: boolean;
  readonly graphs: boolean;
  readonly intelligence: boolean;
  readonly impact: boolean;
  readonly map: boolean;
  readonly navigation: boolean;
};

/** M-003 skeleton: no real engines yet. */
export const STUB_CAPABILITIES: PrismCapabilities = {
  indexing: false,
  analysis: false,
  graphs: false,
  intelligence: false,
  impact: false,
  map: false,
  navigation: false,
};
