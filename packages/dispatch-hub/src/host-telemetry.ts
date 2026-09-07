import { cpus, freemem, totalmem } from "node:os";
import { statfs } from "node:fs/promises";

export type HostTelemetry = {
  readonly cpu: number | undefined;
  readonly memUsed: number | undefined;
  readonly memTotal: number | undefined;
  readonly diskUsed: number | undefined;
  readonly diskTotal: number | undefined;
};

export async function readHostTelemetry(
  diskPath: string = process.cwd(),
): Promise<HostTelemetry> {
  const memTotal = totalmem();
  const memFree = freemem();
  let diskUsed: number | undefined;
  let diskTotal: number | undefined;
  try {
    const disk = await statfs(diskPath);
    diskTotal = Number(disk.blocks) * Number(disk.bsize);
    const free = Number(disk.bavail) * Number(disk.bsize);
    diskUsed = diskTotal - free;
  } catch {
    diskUsed = undefined;
    diskTotal = undefined;
  }
  const load = cpus().reduce((sum, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return sum + (total === 0 ? 0 : 1 - cpu.times.idle / total);
  }, 0);
  return {
    cpu: cpus().length === 0 ? undefined : (load / cpus().length) * 100,
    memUsed: memTotal - memFree,
    memTotal,
    diskUsed,
    diskTotal,
  };
}
