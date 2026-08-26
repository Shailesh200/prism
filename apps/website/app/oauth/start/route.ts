import {
  handleOAuthStart,
  prismAuthConfig,
  prismAuthRuntime,
} from "@/lib/prism-auth";

export const runtime = prismAuthRuntime;

export function GET(request: Request): Promise<Response> {
  return handleOAuthStart(request, prismAuthConfig());
}
