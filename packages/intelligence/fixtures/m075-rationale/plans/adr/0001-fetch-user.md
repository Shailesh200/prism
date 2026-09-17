# ADR-0001 Fetch user

Callers of `src/users/fetchUser.ts` own caching. Do not add an LRU here.
