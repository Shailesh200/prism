import {
  configFromEnv,
  handleOAuthCallback,
  handleOAuthDrivers,
  handleOAuthRedeem,
  handleOAuthRefresh,
  handleOAuthStart,
} from "@repo-prism/dispatch-auth";

export function prismAuthConfig() {
  return configFromEnv(process.env);
}

export {
  handleOAuthCallback,
  handleOAuthDrivers,
  handleOAuthRedeem,
  handleOAuthRefresh,
  handleOAuthStart,
};
