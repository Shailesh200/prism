import { handleOAuthRefresh, prismAuthConfig } from "@/lib/prism-auth";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleOAuthRefresh(request, prismAuthConfig());
}
