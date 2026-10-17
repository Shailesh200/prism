/**
 * Fill a WorkOrder from blast fan-in, git ownership, and generated/vendor
 * paths (M-076 O1). Hook is armed only by an Accepted veto ADR.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_WORK_ORDER,
  isAcceptedWorkOrderVetoAdr,
  offLimitReason,
  type GitFileSignal,
  type IndexSnapshot,
  type WorkOrder,
  type WorkOrderOffLimit,
} from "@repo-prism/shared";
import { cachedDependencyGraph } from "./graph-cache.js";

const FAN_IN_SIGN_OFF = 2;
const OWNER_SIGN_OFF = 3;
const ADR_FILE =
  /(?:^|\/)(?:plans\/adr\/|docs\/adr\/|adr\/)|(?:^|\/)ADR-\d{4}/i;
const MAX_BYTES = 256_000;

function fileFanIn(snapshot: IndexSnapshot): Map<string, number> {
  const graph = cachedDependencyGraph(snapshot).graph;
  const counts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (!edge.from.startsWith("file:") || !edge.to.startsWith("file:")) {
      continue;
    }
    const to = edge.to.slice("file:".length);
    counts.set(to, (counts.get(to) ?? 0) + 1);
  }
  return counts;
}

function readAdr(root: string, rel: string): string | null {
  try {
    const buf = readFileSync(join(root, rel), { encoding: "utf8" });
    return buf.length > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
  } catch {
    return null;
  }
}

export function isWorkOrderHookArmed(snapshot: IndexSnapshot): boolean {
  for (const file of snapshot.files) {
    if (!ADR_FILE.test(file.path)) continue;
    const text = readAdr(snapshot.rootPath, file.path);
    if (text && isAcceptedWorkOrderVetoAdr(text)) return true;
  }
  return false;
}

export function buildWorkOrder(input: {
  readonly snapshot: IndexSnapshot;
  readonly packPaths: readonly string[];
  readonly gitFiles?: readonly GitFileSignal[];
}): WorkOrder {
  const hookArmed = isWorkOrderHookArmed(input.snapshot);
  const fanIn = fileFanIn(input.snapshot);
  const offLimits: WorkOrderOffLimit[] = [];
  const blocked = new Set<string>();

  for (const file of input.snapshot.files) {
    const reason = offLimitReason(file.path);
    if (!reason) continue;
    offLimits.push({ path: file.path, reason });
    blocked.add(file.path);
  }
  const offLimitsSorted = [...offLimits].sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  const needsSignOff: string[] = [];
  for (const path of input.packPaths) {
    if (blocked.has(path)) continue;
    const blast = (fanIn.get(path) ?? 0) >= FAN_IN_SIGN_OFF;
    const owners =
      input.gitFiles?.find((g) => g.path === path)?.contributors.length ?? 0;
    if (blast || owners >= OWNER_SIGN_OFF) needsSignOff.push(path);
  }
  const needsSignOffSorted = [...needsSignOff].sort((a, b) =>
    a.localeCompare(b),
  );

  const signOff = new Set(needsSignOffSorted);
  const inScope = [...input.packPaths]
    .filter((path) => !blocked.has(path) && !signOff.has(path))
    .sort((a, b) => a.localeCompare(b));

  if (
    inScope.length === 0 &&
    offLimitsSorted.length === 0 &&
    needsSignOffSorted.length === 0 &&
    !hookArmed
  ) {
    return EMPTY_WORK_ORDER;
  }

  return {
    inScope,
    offLimits: offLimitsSorted,
    needsSignOff: needsSignOffSorted,
    advisory: !hookArmed,
    hookArmed,
  };
}
