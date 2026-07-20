import { helper, type HelperType } from "./helper.js";
import def from "./default-mod.js";

export const answer = 42;

export function greet(name: string): string {
  return helper(name);
}

export class Greeter {
  greet(name: string): string {
    return greet(name);
  }
}

export interface Person {
  name: string;
}

export type Id = string;

export enum Role {
  Admin,
  User,
}

const local = "local";

function internal(): void {
  def(local);
}

export { local as localAlias };
export default class App {}
