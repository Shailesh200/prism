import { handleOAuthRedeem, prismAuthConfig } from "@/lib/prism-auth";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleOAuthRedeem(request, prismAuthConfig());
}
