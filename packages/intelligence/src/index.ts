/** @prism/intelligence — stack detector SPI (M-040); DNA packs in M-013. */

export {
  STACK_DETECTOR_SPI_VERSION,
  STACK_DETECTOR_SPI_VERSION_MAX,
  STACK_DETECTOR_SPI_VERSION_MIN,
} from "./spi-version.js";
export type {
  StackDetectContext,
  StackDetector,
  StackDetectorInfo,
} from "./types.js";
export { StackDetectorRegistry } from "./registry.js";
export {
  createNodejsManifestDetector,
  createUnknownDetector,
} from "./detectors.js";
export {
  createStackHost,
  type StackHost,
  type StackHostOptions,
} from "./host.js";
export {
  buildDependencyGraph,
  type DependencyGraphOptions,
  type DependencyGraphResult,
  type UnresolvedDependency,
} from "./dependency/build.js";
export { findCycles } from "./dependency/cycles.js";
