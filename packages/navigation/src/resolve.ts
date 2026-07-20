import type { IndexSnapshot } from "@prism/shared";
import { fileNodeId } from "./paths.js";

export type RouteEndpoint =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "symbol"; readonly name: string; readonly path?: string };

/**
 * Resolve a route endpoint to a dependency-graph file node id.
 */
export function resolveEndpointNodeId(
  snapshot: IndexSnapshot,
  endpoint: RouteEndpoint,
): string | null {
  if (endpoint.kind === "file") {
    const path = endpoint.path.replace(/^\.\//, "");
    const hit = snapshot.files.find((f) => f.path === path);
    return hit ? fileNodeId(hit.path) : fileNodeId(path);
  }

  const name = endpoint.name;
  const candidates = snapshot.files.filter((f) => {
    if (endpoint.path && f.path !== endpoint.path) return false;
    return f.symbols.some((s) => s.name === name);
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.path.localeCompare(b.path));
  return fileNodeId(candidates[0]!.path);
}
