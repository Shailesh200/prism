/** @repo-prism/graph-engine — ngraph store + query primitives (M-009). */

export const PACKAGE_NAME = "@repo-prism/graph-engine" as const;

export {
  createGraphStore,
  graphStoreFromJSON,
  type GraphStore,
  type NeighborOptions,
} from "./store.js";
export { layoutGraph, type LayoutOptions } from "./layout.js";
export { nodesFromIndexSnapshot } from "./from-index.js";
export {
  labelPropagationCommunities,
  type CommunityEdge,
  type CommunityPartition,
  type LabelPropagationOptions,
} from "./community.js";
