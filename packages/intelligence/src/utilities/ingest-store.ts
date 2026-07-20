import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  IngestArtifactMetaSchema,
  IngestArtifactSchema,
  PrismErrorCode,
  type IngestArtifact,
  type IngestArtifactMeta,
  type JsonValue,
  type PrismError,
  type Result,
  err,
  ok,
  parseDto,
  prismError,
} from "@prism/shared";

export type WriteIngestInput = {
  readonly kind: string;
  readonly payload: JsonValue;
  readonly sourceJobId?: string;
  readonly packageId?: string;
  readonly labels?: readonly string[];
};

export type IngestStore = {
  readonly rootDir: string;
  write(input: WriteIngestInput): Promise<Result<IngestArtifact, PrismError>>;
  get(id: string): Promise<Result<IngestArtifact, PrismError>>;
  list(filter?: {
    kind?: string;
    packageId?: string;
  }): Promise<Result<IngestArtifactMeta[], PrismError>>;
};

function metaPath(rootDir: string, id: string): string {
  return join(rootDir, `${id}.meta.json`);
}

function payloadPath(rootDir: string, id: string): string {
  return join(rootDir, `${id}.json`);
}

function newId(kind: string): string {
  const safe = kind.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 32);
  return `${safe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createIngestStore(options: {
  readonly workspaceRoot: string;
  /** Absolute or workspace-relative ingest root override. */
  readonly ingestRoot?: string;
}): IngestStore {
  const rootDir =
    options.ingestRoot ?? join(options.workspaceRoot, ".prism", "ingest");

  return {
    rootDir,
    async write(input) {
      const kind = input.kind.trim();
      if (!kind) {
        return err(
          prismError(PrismErrorCode.VALIDATION, "Ingest kind is empty"),
        );
      }
      await mkdir(rootDir, { recursive: true });
      const id = newId(kind);
      const relativePath = `.prism/ingest/${id}.json`;
      const meta: IngestArtifactMeta = {
        id,
        kind,
        storedAt: new Date().toISOString(),
        relativePath,
        labels: [...(input.labels ?? [])],
        ...(input.sourceJobId === undefined
          ? {}
          : { sourceJobId: input.sourceJobId }),
        ...(input.packageId === undefined
          ? {}
          : { packageId: input.packageId }),
      };
      const parsedMeta = parseDto(IngestArtifactMetaSchema, meta);
      if (!parsedMeta.ok) {
        return err(prismError(PrismErrorCode.VALIDATION, parsedMeta.message));
      }
      const metaValue: IngestArtifactMeta = {
        ...parsedMeta.value,
        labels: parsedMeta.value.labels ?? [],
      };
      await writeFile(
        metaPath(rootDir, id),
        `${JSON.stringify(metaValue, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        payloadPath(rootDir, id),
        `${JSON.stringify(input.payload, null, 2)}\n`,
        "utf8",
      );
      const artifact: IngestArtifact = {
        ...metaValue,
        payload: input.payload,
      };
      return ok(artifact);
    },
    async get(id) {
      try {
        const metaRaw = JSON.parse(
          await readFile(metaPath(rootDir, id), "utf8"),
        ) as unknown;
        const payload = JSON.parse(
          await readFile(payloadPath(rootDir, id), "utf8"),
        ) as JsonValue;
        const parsed = parseDto(IngestArtifactSchema, {
          ...(metaRaw as object),
          payload,
        });
        if (!parsed.ok) {
          return err(prismError(PrismErrorCode.VALIDATION, parsed.message));
        }
        return ok({
          ...parsed.value,
          labels: parsed.value.labels ?? [],
        });
      } catch {
        return err(
          prismError(
            PrismErrorCode.NOT_FOUND,
            `Ingest artifact not found: ${id}`,
            {
              id,
            },
          ),
        );
      }
    },
    async list(filter) {
      try {
        await mkdir(rootDir, { recursive: true });
        const names = await readdir(rootDir);
        const metas: IngestArtifactMeta[] = [];
        for (const name of names) {
          if (!name.endsWith(".meta.json")) continue;
          try {
            const raw = JSON.parse(
              await readFile(join(rootDir, name), "utf8"),
            ) as unknown;
            const parsed = parseDto(IngestArtifactMetaSchema, raw);
            if (!parsed.ok) continue;
            if (filter?.kind && parsed.value.kind !== filter.kind) continue;
            if (
              filter?.packageId &&
              parsed.value.packageId !== filter.packageId
            ) {
              continue;
            }
            metas.push({
              ...parsed.value,
              labels: parsed.value.labels ?? [],
            });
          } catch {
            // skip corrupt
          }
        }
        metas.sort((a, b) => b.storedAt.localeCompare(a.storedAt));
        return ok(metas);
      } catch (cause) {
        return err(
          prismError(
            PrismErrorCode.IO_ERROR,
            "Failed to list ingest artifacts",
            {
              cause: String(cause),
            },
          ),
        );
      }
    },
  };
}
