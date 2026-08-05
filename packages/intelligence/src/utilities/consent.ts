import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CONSENT_PURPOSE_IDS,
  ConsentRecordSchema,
  PrismErrorCode,
  consentRequiredMessage,
  isConsentPurposeId,
  type ConsentRecord,
  type PrismError,
  type Result,
  err,
  ok,
  parseDto,
  prismError,
} from "@repo-prism/shared";

export type ConsentStore = {
  list(): Promise<Result<ConsentRecord[], PrismError>>;
  get(purpose: string): Promise<Result<ConsentRecord | null, PrismError>>;
  set(
    purpose: string,
    granted: boolean,
  ): Promise<Result<ConsentRecord, PrismError>>;
  /**
   * Gate network-backed probes (X-06).
   * Returns ok(true) only when an explicit grant exists for `purpose`.
   */
  requireGranted(purpose: string): Promise<Result<true, PrismError>>;
};

type ConsentFile = {
  records: ConsentRecord[];
};

async function readConsentFile(path: string): Promise<ConsentFile> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || !("records" in raw)) {
      return { records: [] };
    }
    const records = (raw as { records: unknown }).records;
    if (!Array.isArray(records)) return { records: [] };
    const out: ConsentRecord[] = [];
    for (const item of records) {
      const parsed = parseDto(ConsentRecordSchema, item);
      if (parsed.ok) out.push(parsed.value);
    }
    return { records: out };
  } catch {
    return { records: [] };
  }
}

export function createConsentStore(options: {
  readonly workspaceRoot: string;
  /** Override path to consent JSON (default `.prism/consent.json`). */
  readonly consentPath?: string;
}): ConsentStore {
  const filePath =
    options.consentPath ??
    join(options.workspaceRoot, ".prism", "consent.json");

  return {
    async list() {
      const file = await readConsentFile(filePath);
      return ok(file.records);
    },
    async get(purpose) {
      const file = await readConsentFile(filePath);
      return ok(file.records.find((r) => r.purpose === purpose) ?? null);
    },
    async set(purpose, granted) {
      const trimmed = purpose.trim();
      if (!isConsentPurposeId(trimmed)) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            trimmed
              ? `Unknown consent purpose "${trimmed}". Known purposes: ${CONSENT_PURPOSE_IDS.join(", ")}`
              : "Consent purpose is empty",
            { purpose: trimmed },
          ),
        );
      }
      const file = await readConsentFile(filePath);
      const record: ConsentRecord = {
        purpose: trimmed,
        granted,
        decidedAt: new Date().toISOString(),
      };
      const next = [
        ...file.records.filter((r) => r.purpose !== trimmed),
        record,
      ];
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(
        filePath,
        `${JSON.stringify({ records: next }, null, 2)}\n`,
        "utf8",
      );
      return ok(record);
    },
    async requireGranted(purpose) {
      // An unknown purpose can never have been granted, and treating it as
      // "not yet decided" would let a typo become an unprompted allow the
      // moment someone wrote a matching record by hand.
      if (!isConsentPurposeId(purpose)) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            `Unknown consent purpose "${purpose}". Known purposes: ${CONSENT_PURPOSE_IDS.join(", ")}`,
            { purpose },
          ),
        );
      }
      const got = await this.get(purpose);
      if (!got.ok) return got;
      if (!got.value || !got.value.granted) {
        return err(
          prismError(
            PrismErrorCode.UNSUPPORTED,
            consentRequiredMessage(purpose),
            {
              purpose,
            },
          ),
        );
      }
      return ok(true);
    },
  };
}
