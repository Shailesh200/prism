export async function fetchUser(id: string): Promise<{ id: string; source: "other" }> {
  return { id, source: "other" };
}
