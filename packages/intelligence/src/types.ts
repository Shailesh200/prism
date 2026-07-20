import type {
  DeveloperPersonaId,
  PrismError,
  Result,
  StackDomainId,
  StackSignal,
} from "@prism/shared";

export type StackDetectContext = {
  readonly rootPath: string;
  /** Optional repo-relative paths from inventory (M-005+). */
  readonly filePaths?: readonly string[];
};

/**
 * Stack detector SPI — emit additive signals; Core never embeds framework checks.
 * Rich packs land in M-013.
 */
export type StackDetector = {
  readonly id: string;
  readonly spiVersion: number;
  /** Domains this detector may emit (documentation / negotiation). */
  readonly domains: readonly StackDomainId[];
  /** Personas this detector may hint. */
  readonly personaHints: readonly DeveloperPersonaId[];
  detect(
    ctx: StackDetectContext,
  ): Promise<Result<readonly StackSignal[], PrismError>>;
};

/** JSON-serializable descriptor for Core / MCP. */
export type StackDetectorInfo = {
  readonly id: string;
  readonly spiVersion: number;
  readonly domains: readonly string[];
  readonly personaHints: readonly string[];
};
