import { PrismErrorCode, prismError } from "./errors.js";
import { err, ok, type Result } from "./result.js";

declare const RepoIdBrand: unique symbol;
declare const FileIdBrand: unique symbol;
declare const SymbolIdBrand: unique symbol;
declare const NodeIdBrand: unique symbol;
declare const EdgeIdBrand: unique symbol;
declare const FeatureIdBrand: unique symbol;

export type RepoId = string & { readonly [RepoIdBrand]: typeof RepoIdBrand };
export type FileId = string & { readonly [FileIdBrand]: typeof FileIdBrand };
export type SymbolId = string & {
  readonly [SymbolIdBrand]: typeof SymbolIdBrand;
};
export type NodeId = string & { readonly [NodeIdBrand]: typeof NodeIdBrand };
export type EdgeId = string & { readonly [EdgeIdBrand]: typeof EdgeIdBrand };
export type FeatureId = string & {
  readonly [FeatureIdBrand]: typeof FeatureIdBrand;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_./:@-]{0,255}$/;

function parseBrandedId<T extends string>(
  kind: string,
  raw: string,
  cast: (s: string) => T,
): Result<T, ReturnType<typeof prismError>> {
  if (raw !== raw.trim() || !raw || !ID_PATTERN.test(raw)) {
    return err(
      prismError(
        PrismErrorCode.INVALID_ID,
        `Invalid ${kind}: ${JSON.stringify(raw)}`,
      ),
    );
  }
  return ok(cast(raw));
}

export function asRepoId(
  raw: string,
): Result<RepoId, ReturnType<typeof prismError>> {
  return parseBrandedId("RepoId", raw, (s) => s as RepoId);
}

export function asFileId(
  raw: string,
): Result<FileId, ReturnType<typeof prismError>> {
  return parseBrandedId("FileId", raw, (s) => s as FileId);
}

export function asSymbolId(
  raw: string,
): Result<SymbolId, ReturnType<typeof prismError>> {
  return parseBrandedId("SymbolId", raw, (s) => s as SymbolId);
}

export function asNodeId(
  raw: string,
): Result<NodeId, ReturnType<typeof prismError>> {
  return parseBrandedId("NodeId", raw, (s) => s as NodeId);
}

export function asEdgeId(
  raw: string,
): Result<EdgeId, ReturnType<typeof prismError>> {
  return parseBrandedId("EdgeId", raw, (s) => s as EdgeId);
}

export function asFeatureId(
  raw: string,
): Result<FeatureId, ReturnType<typeof prismError>> {
  return parseBrandedId("FeatureId", raw, (s) => s as FeatureId);
}

/** Unsafe cast for trusted internal construction after validation. */
export function unsafeRepoId(raw: string): RepoId {
  return raw as RepoId;
}
export function unsafeFileId(raw: string): FileId {
  return raw as FileId;
}
export function unsafeSymbolId(raw: string): SymbolId {
  return raw as SymbolId;
}
export function unsafeNodeId(raw: string): NodeId {
  return raw as NodeId;
}
export function unsafeEdgeId(raw: string): EdgeId {
  return raw as EdgeId;
}
export function unsafeFeatureId(raw: string): FeatureId {
  return raw as FeatureId;
}
