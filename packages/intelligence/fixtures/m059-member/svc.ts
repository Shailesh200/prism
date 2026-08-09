export class Greeter {
  greet(): string {
    return "hi";
  }

  run(): number {
    return 1;
  }
}

export function callAll(g: Greeter): number {
  g.greet();
  g?.greet();
  return g.run();
}
