import type {
  GitRecentFile,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
  Result,
  PrismError,
} from "@prism/shared";
import {
  Prism,
  PrismErrorCode,
  err,
  ok,
  prismError,
  type PrismClient,
  type PrismWorkspace,
} from "@prism/core";

export type MapPayload = {
  map: RepositoryMap;
  recentChanges: GitRecentFile[];
  branch?: string;
};

/**
 * Core lifecycle for one workspace folder (M-030). No VS Code imports —
 * unit-testable.
 */
export class PrismSession {
  private client: PrismClient | null = null;
  private workspace: PrismWorkspace | null = null;
  private rootPath: string | null = null;

  get root(): string | null {
    return this.rootPath;
  }

  get isOpen(): boolean {
    return this.workspace !== null;
  }

  async open(absoluteRoot: string): Promise<Result<void, PrismError>> {
    this.close();
    this.client = Prism.create();
    const opened = this.client.openRepository(absoluteRoot);
    if (!opened.ok) return opened;
    this.workspace = opened.value;
    this.rootPath = absoluteRoot;
    const indexed = await this.workspace.index();
    if (!indexed.ok) {
      this.close();
      return indexed;
    }
    return ok(undefined);
  }

  async reindex(): Promise<Result<void, PrismError>> {
    if (!this.workspace) {
      return err(
        prismError(
          PrismErrorCode.WORKSPACE_NOT_OPEN,
          "No Prism workspace open",
        ),
      );
    }
    const result = await this.workspace.reindex();
    if (!result.ok) return result;
    return ok(undefined);
  }

  getMap(
    zoom: MapZoomLevel = "package",
    layers?: readonly MapLayerId[],
  ): Result<MapPayload, PrismError> {
    if (!this.workspace) {
      return err(
        prismError(
          PrismErrorCode.WORKSPACE_NOT_OPEN,
          "No Prism workspace open",
        ),
      );
    }
    const map = this.workspace.getRepositoryMap({
      zoom,
      ...(layers ? { layers: [...layers] } : {}),
    });
    if (!map.ok) return map;

    const git = this.workspace.getGitActivity();
    const recentChanges =
      git.ok && git.value.available ? git.value.recentFiles : [];
    const branch =
      git.ok && git.value.available ? git.value.summary?.branch : undefined;

    return ok({
      map: map.value,
      recentChanges,
      ...(branch !== undefined ? { branch } : {}),
    });
  }

  close(): void {
    if (this.workspace) {
      this.workspace.close();
    }
    this.workspace = null;
    this.client = null;
    this.rootPath = null;
  }
}
