import { fetchUser } from "./fetchUser.js";

export async function fetchUserTest(): Promise<void> {
  await fetchUser("1");
}
