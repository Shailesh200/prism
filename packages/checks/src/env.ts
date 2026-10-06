/**
 * A check spawned from inside a git hook or a worktree inherits `GIT_*`
 * variables that point git at the wrong repository. Strip them so the repo's
 * own scripts see the checkout they run in.
 */
const GIT_OVERRIDE_ENV = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
] as const;

export function gitChildEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const key of GIT_OVERRIDE_ENV) {
    delete env[key];
  }
  return env;
}
