import { add, Base } from "./helper.js";

export function run(): number {
  return add(1, 2);
}

export class Child extends Base {
  override value() {
    return super.value() + 1;
  }
}
