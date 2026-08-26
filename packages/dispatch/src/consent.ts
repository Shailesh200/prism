import { ConsentRecordSchema } from "@repo-prism/shared";
import { consentPath } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

type ConsentFile = { records: unknown[] };

export async function isPurposeGranted(
  workspaceRoot: string,
  purpose: string,
): Promise<boolean> {
  const file = await readJsonFile<ConsentFile>(consentPath(workspaceRoot), {
    records: [],
  });
  const records = (file.records ?? []).flatMap((raw) => {
    const parsed = ConsentRecordSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  return records.some((record) => record.purpose === purpose && record.granted);
}

export async function grantPurpose(
  workspaceRoot: string,
  purpose: string,
): Promise<void> {
  const file = await readJsonFile<ConsentFile>(consentPath(workspaceRoot), {
    records: [],
  });
  const records = (file.records ?? []).flatMap((raw) => {
    const parsed = ConsentRecordSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  const next = [
    ...records.filter((record) => record.purpose !== purpose),
    {
      purpose,
      granted: true,
      decidedAt: new Date().toISOString(),
    },
  ];
  await writeJsonFile(consentPath(workspaceRoot), { records: next });
}

export async function revokePurpose(
  workspaceRoot: string,
  purpose: string,
): Promise<void> {
  const file = await readJsonFile<ConsentFile>(consentPath(workspaceRoot), {
    records: [],
  });
  const records = (file.records ?? []).flatMap((raw) => {
    const parsed = ConsentRecordSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  const next = [
    ...records.filter((record) => record.purpose !== purpose),
    {
      purpose,
      granted: false,
      decidedAt: new Date().toISOString(),
    },
  ];
  await writeJsonFile(consentPath(workspaceRoot), { records: next });
}
