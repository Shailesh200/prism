import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@repo-prism/shared";
import {
  STACK_DETECTOR_SPI_VERSION_MAX,
  STACK_DETECTOR_SPI_VERSION_MIN,
} from "./spi-version.js";
import type { StackDetector, StackDetectorInfo } from "./types.js";

function toInfo(detector: StackDetector): StackDetectorInfo {
  return {
    id: detector.id,
    spiVersion: detector.spiVersion,
    domains: [...detector.domains],
    personaHints: [...detector.personaHints],
  };
}

/**
 * Registers stack detectors. Duplicate ids fail; signals are additive across detectors.
 */
export class StackDetectorRegistry {
  private readonly byId = new Map<string, StackDetector>();

  register(detector: StackDetector): Result<StackDetectorInfo, PrismError> {
    const id = detector.id.trim();
    if (!id) {
      return err(
        prismError(PrismErrorCode.VALIDATION, "Detector id must be non-empty"),
      );
    }

    if (
      detector.spiVersion < STACK_DETECTOR_SPI_VERSION_MIN ||
      detector.spiVersion > STACK_DETECTOR_SPI_VERSION_MAX
    ) {
      return err(
        prismError(
          PrismErrorCode.UNSUPPORTED,
          `Detector "${id}" spiVersion ${detector.spiVersion} outside host range ${STACK_DETECTOR_SPI_VERSION_MIN}–${STACK_DETECTOR_SPI_VERSION_MAX}`,
          {
            detectorId: id,
            spiVersion: detector.spiVersion,
            min: STACK_DETECTOR_SPI_VERSION_MIN,
            max: STACK_DETECTOR_SPI_VERSION_MAX,
          },
        ),
      );
    }

    if (this.byId.has(id)) {
      return err(
        prismError(
          PrismErrorCode.VALIDATION,
          `Detector id "${id}" is already registered`,
          { detectorId: id },
        ),
      );
    }

    const normalized: StackDetector = { ...detector, id };
    this.byId.set(id, normalized);
    return ok(toInfo(normalized));
  }

  resolveById(id: string): StackDetector | undefined {
    return this.byId.get(id);
  }

  list(): readonly StackDetectorInfo[] {
    return [...this.byId.values()].map(toInfo);
  }

  detectors(): readonly StackDetector[] {
    return [...this.byId.values()];
  }
}
