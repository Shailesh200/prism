import {
  handleOAuthDrivers,
  prismAuthConfig,
  prismAuthRuntime,
} from "@/lib/prism-auth";

export const runtime = prismAuthRuntime;

export function GET(request: Request): Promise<Response> {
  return handleOAuthDrivers(request, prismAuthConfig());
}
