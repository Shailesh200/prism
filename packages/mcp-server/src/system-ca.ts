/**
 * Re-exported from `@repo-prism/dispatch` so the host MCP process and the
 * Dispatch worker child trust the same certificate authorities. The
 * implementation moved because the worker child is a separate Node process and
 * needs to call it itself (see that module for why).
 */

export {
  trustSystemCertificateAuthorities,
  type SystemCaTls,
} from "@repo-prism/dispatch";
