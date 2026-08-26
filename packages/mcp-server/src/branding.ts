import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

export const SERVER_NAME = "prism";
export const SERVER_TITLE = "Prism";
export const SERVER_WEBSITE_URL = "https://www.prismhq.in";
export const SERVER_ICON_HTTPS = `${SERVER_WEBSITE_URL}/brand/prism-mark.png`;
export const SERVER_DESCRIPTION =
  "Local-first Software Intelligence Engine — maps, impact, and Dispatch.";

function packageJsonPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
}

function markPngPath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "media",
    "prism-mark.png",
  );
}

export function readPackageVersion(): string {
  try {
    const raw = JSON.parse(readFileSync(packageJsonPath(), "utf8")) as {
      version?: unknown;
    };
    return typeof raw.version === "string" ? raw.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function prismMarkDataUri(): string | undefined {
  try {
    const bytes = readFileSync(markPngPath());
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export function prismServerIcons(): NonNullable<Implementation["icons"]> {
  const icons: NonNullable<Implementation["icons"]> = [];
  const dataUri = prismMarkDataUri();
  if (dataUri) {
    icons.push({
      src: dataUri,
      mimeType: "image/png",
      sizes: ["32x32"],
    });
  }
  icons.push({
    src: SERVER_ICON_HTTPS,
    mimeType: "image/png",
    sizes: ["128x128"],
  });
  return icons;
}

export function prismMcpImplementation(version?: string): Implementation {
  return {
    name: SERVER_NAME,
    title: SERVER_TITLE,
    version: version ?? readPackageVersion(),
    websiteUrl: SERVER_WEBSITE_URL,
    description: SERVER_DESCRIPTION,
    icons: prismServerIcons(),
  };
}
