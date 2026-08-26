import { handleOAuthDrivers, prismAuthConfig } from "@/lib/prism-auth";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return handleOAuthDrivers(request, prismAuthConfig());
}
