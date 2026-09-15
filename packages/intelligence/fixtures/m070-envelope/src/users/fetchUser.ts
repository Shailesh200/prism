/** UNIQUE_M070_FILE_BODY_TOKEN — serializer must never echo this string. */
export async function fetchUser(id: string): Promise<{ id: string }> {
  return { id };
}
