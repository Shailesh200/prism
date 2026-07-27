/**
 * Derive a human stack label for a security check from its domain + DNA frameworks.
 * Presentation-only — does not change SecurityCheck.domain.
 */
export function securityStackLabel(
  domain: string | undefined,
  frameworks: readonly string[],
): string {
  const ids = frameworks.map((f) => f.toLowerCase());
  const has = (needle: string): boolean =>
    ids.some((id) => id === needle || id.includes(needle));

  const hasNext = has("frontend-next") || has("next");
  const hasReact = has("frontend-react") || has("react");
  const hasExpress = has("backend-express") || has("express");
  const hasNest = has("backend-nest") || has("nest");
  const hasFastify = has("backend-fastify") || has("fastify");

  const d = (domain ?? "").toLowerCase();
  if (d === "frontend" || d === "front-end") {
    if (hasNext && hasReact) return "Next/React Frontend";
    if (hasNext) return "Next.js Frontend";
    if (hasReact) return "React Frontend";
    return "Frontend";
  }
  if (d === "backend" || d === "back-end") {
    if (hasNext) return "Next server";
    if (hasNest) return "NestJS Backend";
    if (hasExpress) return "Express Backend";
    if (hasFastify) return "Fastify Backend";
    return "Backend";
  }
  if (!domain) return "General";
  // Title-case unknown domains lightly.
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}
