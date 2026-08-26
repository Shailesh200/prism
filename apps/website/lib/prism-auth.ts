import {
  configFromEnv,
  handleOAuthCallback,
  handleOAuthDrivers,
  handleOAuthRedeem,
  handleOAuthStart,
} from "@repo-prism/dispatch-auth";

export const prismAuthRuntime = "nodejs" as const;

export function prismAuthConfig() {
  return configFromEnv(process.env);
}

export {
  handleOAuthCallback,
  handleOAuthDrivers,
  handleOAuthRedeem,
  handleOAuthStart,
};
