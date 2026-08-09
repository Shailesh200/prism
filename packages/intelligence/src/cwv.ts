/**
 * Node-free CWV parse path for browser / webview surfaces.
 * Import `@repo-prism/intelligence/cwv` — does not pull lighthouse-runner / fs.
 */

export {
  CWV_THRESHOLDS,
  LIGHTHOUSE_CALLOUT,
  attributionsFromLighthouseAudits,
  attributionsFromPayload,
  buildCwvReport,
  buildCwvRollups,
  categoryScoresFromLighthouse,
  cwvFieldReportFromPagespeedJson,
  cwvMetricsFromLighthouse,
  cwvReportFromLighthouseJson,
  fieldMetricsFromPagespeedJson,
  insightsFromLighthouse,
  labFixtureLighthouseJson,
  labUrlForRoute,
  medianMergeLighthouseReports,
  mergeRouteCwvReports,
  metric,
  metricsFromLighthouseJson,
  pickNumeric,
  pickScore,
  ratingFromMetricValue,
  ratingFromScore,
  routeKeyFromUrl,
  scoreRating,
  tbtMsFromLighthouse,
  unwrapLighthouseJson,
  type BuildCwvReportInput,
} from "./utilities/cwv.js";
export {
  extractFrontendRoutesFromSource,
  heuristicFrontendRoutes,
  normalizeFrontendRoute,
  routeFromPageFilePath,
} from "./utilities/frontend-route-paths.js";
