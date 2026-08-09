/**
 * Pure GitHub CI helpers for surfaces (M-053 / ADR-0033).
 * Network I/O goes through Core via {@link AppShellClient} / PrismClient.
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
} from "@repo-prism/intelligence/github-ci";
