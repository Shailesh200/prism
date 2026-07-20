export function login(user: string): string {
  return `session:${user}`;
}
