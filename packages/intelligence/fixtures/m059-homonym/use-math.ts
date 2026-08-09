import { shared } from "./math.ts";

export function total(): number {
  return shared(1, 2);
}
