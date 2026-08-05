/** @repo-prism/navigation — dependency / feature routes + landmarks (M-016). */

export {
  fileNodeId,
  findPaths,
  shortestPath,
  type FindPathsOptions,
} from "./paths.js";
export { listLandmarks } from "./landmarks.js";
export { navigateFeature } from "./features.js";
export { resolveEndpointNodeId, type RouteEndpoint } from "./resolve.js";

export const PACKAGE_NAME = "@repo-prism/navigation" as const;
