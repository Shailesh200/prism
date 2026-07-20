import { charge } from "../../../packages/billing/src/index.js";

export function checkoutPage(): number {
  return charge(10);
}
