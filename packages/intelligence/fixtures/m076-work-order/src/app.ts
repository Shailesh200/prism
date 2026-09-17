import { fetchUser } from "./users/fetchUser.js";

export async function boot(): Promise<void> {
  await fetchUser("1");
}
