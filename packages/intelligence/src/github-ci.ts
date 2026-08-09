/**
 * Node-free GitHub CI parse helpers for browser / webview surfaces.
 * Import `@repo-prism/intelligence/github-ci` — does not pull Node network I/O.
 */

export {
  matchRemoteWorkflowId,
  parseGithubRepoRef,
  type DispatchWorkflowInput,
  type DispatchWorkflowKind,
  type GithubCiConfig,
  type GithubRepoInfo,
  type GithubWorkflowRun,
  type GithubWorkflowSummary,
} from "./utilities/github-ci.js";
