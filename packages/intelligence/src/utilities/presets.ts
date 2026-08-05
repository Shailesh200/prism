import {
  DeveloperPersona,
  StackDomain,
  type PersonaPresets,
  type StackProfile,
} from "@repo-prism/shared";

/**
 * Derive Map / insights preset ids from a stack profile (X-04).
 * Heuristic only — surfaces may ignore or remap.
 */
export function buildPersonaPresets(profile: StackProfile): PersonaPresets {
  const personas = [...profile.personas];
  const domains = [...profile.domains];
  const mapPresets = new Set<string>();
  const insightsPresets = new Set<string>();

  if (domains.includes(StackDomain.FRONTEND)) {
    mapPresets.add("routes_components");
    insightsPresets.add("web_perf");
  }
  if (domains.includes(StackDomain.BACKEND)) {
    mapPresets.add("services_api");
    insightsPresets.add("api_surface");
  }
  if (domains.includes(StackDomain.MOBILE)) {
    mapPresets.add("screens_nav");
    insightsPresets.add("mobile_bridge_risk");
  }
  if (domains.includes(StackDomain.DATA_ML_AI)) {
    mapPresets.add("notebooks_pipelines");
    insightsPresets.add("train_vs_serve");
  }
  if (domains.includes(StackDomain.DEVOPS_PLATFORM)) {
    mapPresets.add("infra_regions");
    insightsPresets.add("iac_criticality");
  }
  if (domains.includes(StackDomain.TOOLING)) {
    mapPresets.add("workspace_tooling");
  }

  if (personas.includes(DeveloperPersona.QA_ENGINEER)) {
    insightsPresets.add("test_graph");
  }
  if (personas.includes(DeveloperPersona.FULLSTACK_ENGINEER)) {
    mapPresets.add("client_server");
  }

  if (mapPresets.size === 0) mapPresets.add("overview");
  if (insightsPresets.size === 0) insightsPresets.add("general");

  const mapList = [...mapPresets].sort((a, b) => a.localeCompare(b));
  const insightList = [...insightsPresets].sort((a, b) => a.localeCompare(b));

  return {
    personas: [...personas].sort((a, b) => a.localeCompare(b)),
    domains: [...domains].sort((a, b) => a.localeCompare(b)),
    mapPresets: mapList,
    insightsPresets: insightList,
    summary:
      personas.length === 0 && domains.length === 0
        ? "Default overview presets (no stack signals)"
        : `Presets for domains=${mapList.length ? domains.join(",") || "none" : "none"}; map=${mapList.join(",")}`,
  };
}
