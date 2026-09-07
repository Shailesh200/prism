import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordWorkerCrash } from "./worker-exit.js";
import { runStatePath } from "./paths.js";

describe("recordWorkerCrash", () => {
  it("writes a failed sidecar with a public error and skips a finished run", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-crash-"));
    const jobId = "crash-job";
    recordWorkerCrash(root, jobId, 42, "uncaught boom");
    const path = runStatePath(root, jobId);
    const first = JSON.parse(await readFile(path, "utf8")) as {
      phase: string;
      errorMessage: string;
      pid: number;
    };
    expect(first.phase).toBe("failed");
    expect(first.pid).toBe(42);
    expect(first.errorMessage).toMatch(/The teammate hit an error/i);
    expect(first.errorMessage).toMatch(/uncaught boom/i);

    await mkdir(join(root, ".prism", "dispatch"), { recursive: true });
    await writeFile(
      path,
      `${JSON.stringify({ jobId, phase: "done", pid: 7 }, null, 2)}\n`,
    );
    recordWorkerCrash(root, jobId, 99, "late crash");
    const second = JSON.parse(await readFile(path, "utf8")) as {
      phase: string;
      pid: number;
    };
    expect(second.phase).toBe("done");
    expect(second.pid).toBe(7);
  });
});
