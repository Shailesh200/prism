import { describe, expect, it } from "vitest";
import { readHostTelemetry } from "./host-telemetry.js";

describe("readHostTelemetry", () => {
  it("returns host numbers or undefined, never invented zeros", async () => {
    const row = await readHostTelemetry(process.cwd());
    if (row.cpu !== undefined) expect(row.cpu).toBeGreaterThanOrEqual(0);
    if (row.memTotal !== undefined) expect(row.memTotal).toBeGreaterThan(0);
    if (row.diskTotal !== undefined) expect(row.diskTotal).toBeGreaterThan(0);
    expect("cpu" in row).toBe(true);
    expect("memUsed" in row).toBe(true);
    expect("diskUsed" in row).toBe(true);
  });

  it("leaves disk figures undefined when the path cannot be read", async () => {
    const row = await readHostTelemetry("/no/such/prism-disk-probe-path-9f3c");
    expect(row.diskUsed).toBeUndefined();
    expect(row.diskTotal).toBeUndefined();
    expect(row.memTotal === undefined || row.memTotal > 0).toBe(true);
  });
});
