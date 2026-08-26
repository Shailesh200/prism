import {
  handleOAuthRedeem,
  prismAuthConfig,
  prismAuthRuntime,
} from "@/lib/prism-auth";

export const runtime = prismAuthRuntime;

export function POST(request: Request): Promise<Response> {
  return handleOAuthRedeem(request, prismAuthConfig());
}
