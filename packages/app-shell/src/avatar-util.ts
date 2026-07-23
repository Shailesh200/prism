import { md5 } from "./md5.js";

/** Two-stop gradient palette for generated avatars (dashboard accents). */
export const AVATAR_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ["#00C2C2", "#0090A0"],
  ["#6C63FF", "#5953D4"],
  ["#F59E0B", "#D97706"],
  ["#10B981", "#059669"],
  ["#F43F5E", "#E11D48"],
  ["#A78BFA", "#7C3AED"],
  ["#38BDF8", "#0284C7"],
];

/** Stable non-negative hash for choosing a deterministic gradient. */
export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** 1–2 letter initials for an author display name. */
export function avatarInitials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
}

/** Deterministic CSS gradient for a name/email key. */
export function avatarGradient(key: string): string {
  const [from, to] = AVATAR_GRADIENTS[
    hashString(key.toLowerCase()) % AVATAR_GRADIENTS.length
  ] ?? ["#00C2C2", "#6C63FF"];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

/**
 * Gravatar URL for a git author email (`d=404` so a missing avatar 404s and the
 * caller can fall back). Returns `null` when there is no email.
 */
export function gravatarUrl(
  email: string | undefined,
  size: number,
): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  return `https://www.gravatar.com/avatar/${md5(normalized)}?s=${size * 2}&d=404`;
}
