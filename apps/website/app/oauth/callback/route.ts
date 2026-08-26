import {
  handleOAuthCallback,
  prismAuthConfig,
  prismAuthRuntime,
} from "@/lib/prism-auth";

export const runtime = prismAuthRuntime;

export function GET(request: Request): Promise<Response> {
  return handleOAuthCallback(request, prismAuthConfig());
}
