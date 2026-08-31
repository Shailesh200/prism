/**
 * Corporate HTTPS interception (Zscaler, AV, proxy) issues a local CA.
 * Browsers trust the OS store; Node’s bundled Mozilla list does not, so an
 * HTTPS call looks like a dead network rather than an untrusted certificate.
 * Trust the OS store in addition to the bundled CAs.
 *
 * This lives in Dispatch, not the MCP server, because the piece that needed it
 * most is the **worker child**: it is a separate Node process, and
 * `setDefaultCACertificates` is per-process runtime state that no environment
 * variable carries across a spawn. Trusting CAs only in the host meant the
 * Cursor SDK failed in the child with "Network request failed".
 *
 * Node 22.15+ (`tls.getCACertificates` / `tls.setDefaultCACertificates`).
 * Harmless no-op on older builds. Do not set NODE_TLS_REJECT_UNAUTHORIZED.
 */

import tls from "node:tls";

export type SystemCaTls = {
  getCACertificates?: (type?: string) => string[];
  setDefaultCACertificates?: (certs: readonly string[]) => void;
};

export function trustSystemCertificateAuthorities(
  api: SystemCaTls = tls as SystemCaTls,
): boolean {
  if (!api.getCACertificates || !api.setDefaultCACertificates) return false;
  try {
    const bundled = api.getCACertificates("bundled");
    const system = api.getCACertificates("system");
    if (system.length === 0) return false;
    api.setDefaultCACertificates([...bundled, ...system]);
    return true;
  } catch {
    return false;
  }
}
