import { access, stat } from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve } from "node:path";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@prism/shared";

const ROOT_MARKERS = [".git", "package.json", ".prismignore"] as const;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function hasRootMarker(dir: string): Promise<boolean> {
  for (const marker of ROOT_MARKERS) {
    if (await exists(resolve(dir, marker))) return true;
  }
  return false;
}

/**
 * Resolve a workspace root from an absolute path (file or directory).
 * Walks upward until `.git`, `package.json`, or `.prismignore` is found;
 * otherwise uses the starting directory if it exists.
 */
export async function resolveWorkspaceRoot(
  inputPath: string,
): Promise<Result<string, PrismError>> {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return err(
      prismError(PrismErrorCode.INVALID_PATH, "Workspace path is empty"),
    );
  }
  if (!isAbsolute(trimmed)) {
    return err(
      prismError(
        PrismErrorCode.INVALID_PATH,
        "resolveWorkspaceRoot requires an absolute filesystem path",
      ),
    );
  }

  let start: string;
  try {
    const st = await stat(trimmed);
    start = st.isDirectory() ? trimmed : dirname(trimmed);
  } catch (cause) {
    return err(
      prismError(PrismErrorCode.IO_ERROR, `Path does not exist: ${trimmed}`, {
        path: trimmed,
        cause: String(cause),
      }),
    );
  }

  let current = resolve(start);
  const fsRoot = parse(current).root;

  while (true) {
    if (await hasRootMarker(current)) {
      return ok(current);
    }
    const parent = dirname(current);
    if (parent === current || current === fsRoot) {
      break;
    }
    current = parent;
  }

  return ok(resolve(start));
}
