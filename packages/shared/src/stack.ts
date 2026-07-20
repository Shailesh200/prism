/**
 * Well-known stack domain IDs (open registry — custom strings allowed).
 * See ADR-0007 / M-040.
 */
export const StackDomain = {
  FRONTEND: "frontend",
  BACKEND: "backend",
  MOBILE: "mobile",
  DESKTOP: "desktop",
  DATA_ML_AI: "data_ml_ai",
  DATA_ENGINEERING: "data_engineering",
  DEVOPS_PLATFORM: "devops_platform",
  EMBEDDED_SYSTEMS: "embedded_systems",
  GAME: "game",
  TOOLING: "tooling",
  UNKNOWN: "unknown",
} as const;

export type WellKnownStackDomain =
  (typeof StackDomain)[keyof typeof StackDomain];

/** Extensible domain id. */
export type StackDomainId = WellKnownStackDomain | (string & {});

/**
 * Well-known developer persona IDs (heuristic audience — not identity).
 */
export const DeveloperPersona = {
  FRONTEND_ENGINEER: "frontend_engineer",
  BACKEND_ENGINEER: "backend_engineer",
  FULLSTACK_ENGINEER: "fullstack_engineer",
  MOBILE_ENGINEER: "mobile_engineer",
  DESKTOP_ENGINEER: "desktop_engineer",
  DATA_SCIENTIST: "data_scientist",
  ML_ENGINEER: "ml_engineer",
  AI_ENGINEER: "ai_engineer",
  DATA_ENGINEER: "data_engineer",
  DEVOPS_SRE: "devops_sre",
  PLATFORM_ENGINEER: "platform_engineer",
  EMBEDDED_ENGINEER: "embedded_engineer",
  GAME_DEVELOPER: "game_developer",
  SECURITY_ENGINEER: "security_engineer",
  QA_ENGINEER: "qa_engineer",
} as const;

export type WellKnownDeveloperPersona =
  (typeof DeveloperPersona)[keyof typeof DeveloperPersona];

export type DeveloperPersonaId = WellKnownDeveloperPersona | (string & {});
