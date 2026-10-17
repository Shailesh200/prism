import { readFile } from "node:fs/promises";
import path from "node:path";

/** The raw B6 sessions. The benchmark pages link here; it is not a docs page. */
// Read at build time, so the deployed bundle never needs the file.
export const dynamic = "force-static";

export async function GET() {
  const body = await readFile(
    path.join(process.cwd(), "../../docs/benchmarks/2.x.json"),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
