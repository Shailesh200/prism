import { login } from "../../../packages/auth/src/index.js";

export function renderDashboard(user: string): string {
  return `dash:${login(user)}`;
}
