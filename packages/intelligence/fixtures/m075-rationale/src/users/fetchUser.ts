// WHY: keep this cache-free — callers own the TTL
export function fetchUser(id: string): string {
  return id;
}
