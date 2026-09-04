import { dirname, join } from "node:path";
import type * as vscode from "vscode";
import {
  rewritePathReferences,
  type ApplyRenameInput,
  type ApplyRenameResult,
} from "@repo-prism/app-shell/apply-rename";

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function absPath(root: string, repoRelative: string): string {
  return join(root, normalize(repoRelative));
}

function absUri(
  vscodeApi: typeof vscode,
  root: string,
  repoRelative: string,
): vscode.Uri {
  return vscodeApi.Uri.file(absPath(root, repoRelative));
}

/**
 * Rename a file in the workspace and best-effort rewrite path/import strings
 * in each editSites file. Does not attempt symbol identifier renames.
 */
export async function applyWorkspaceRename(
  vscodeApi: typeof vscode,
  root: string,
  input: ApplyRenameInput,
): Promise<ApplyRenameResult> {
  const fromPath = normalize(input.fromPath);
  const toPath = normalize(input.toPath);
  if (!fromPath || !toPath) {
    return { ok: false, error: "fromPath and toPath are required" };
  }
  if (fromPath === toPath) {
    return { ok: false, error: "Destination path matches the origin" };
  }

  const fromUri = absUri(vscodeApi, root, fromPath);
  const toUri = absUri(vscodeApi, root, toPath);

  try {
    await vscodeApi.workspace.fs.stat(fromUri);
  } catch {
    return { ok: false, error: `Source file not found: ${fromPath}` };
  }

  try {
    await vscodeApi.workspace.fs.stat(toUri);
    return { ok: false, error: `Destination already exists: ${toPath}` };
  } catch {
    // missing is expected
  }

  const editedFiles: string[] = [];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  for (const site of input.editSites) {
    const sitePath = normalize(site.path);
    if (!sitePath || sitePath === fromPath) continue;
    const siteUri = absUri(vscodeApi, root, sitePath);
    let raw: Uint8Array;
    try {
      raw = await vscodeApi.workspace.fs.readFile(siteUri);
    } catch {
      continue;
    }
    const text = decoder.decode(raw);
    const { next, replacements } = rewritePathReferences(
      text,
      fromPath,
      toPath,
    );
    if (replacements === 0 || next === text) continue;
    await vscodeApi.workspace.fs.writeFile(siteUri, encoder.encode(next));
    editedFiles.push(sitePath);
  }

  const toDirRel = dirname(toPath);
  if (toDirRel && toDirRel !== ".") {
    try {
      await vscodeApi.workspace.fs.createDirectory(
        absUri(vscodeApi, root, toDirRel),
      );
    } catch {
      // may already exist
    }
  }

  try {
    await vscodeApi.workspace.fs.rename(fromUri, toUri, { overwrite: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Rename failed after editing ${editedFiles.length} file(s): ${message}`,
    };
  }

  return { ok: true, fromPath, toPath, editedFiles };
}
