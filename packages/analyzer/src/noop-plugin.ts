import {
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@prism/shared";
import { PrismErrorCode } from "@prism/shared";
import { ANALYZER_SPI_VERSION } from "./spi-version.js";
import type {
  LanguagePlugin,
  ParseInput,
  ParseResult,
  ImportExtraction,
  SymbolExtraction,
} from "./types.js";

const NOOP_ID = "noop" as const;

function ensureOwnParse(parseResult: ParseResult): Result<true, PrismError> {
  if (parseResult.pluginId !== NOOP_ID) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        "noop extractors only accept noop ParseResult",
        { pluginId: parseResult.pluginId },
      ),
    );
  }
  return ok(true);
}

/** Test / scaffold plugin — empty parse & extract; claims `.noop` only. */
export function createNoopPlugin(): LanguagePlugin {
  return {
    id: NOOP_ID,
    spiVersion: ANALYZER_SPI_VERSION,
    extensions: [".noop"],
    capabilities: {
      detect: true,
      parse: true,
      extractSymbols: true,
      extractImports: true,
    },
    detect(input) {
      return input.path.toLowerCase().endsWith(".noop");
    },
    async parse(input: ParseInput) {
      if (!input.path.toLowerCase().endsWith(".noop")) {
        return err(
          prismError(
            PrismErrorCode.ANALYZER_FAILED,
            "noop plugin only parses .noop files",
            { path: input.path },
          ),
        );
      }
      return ok({
        pluginId: NOOP_ID,
        path: input.path,
        ast: { kind: "noop", contentLength: input.content.length },
      });
    },
    extractSymbols(parseResult) {
      const gate = ensureOwnParse(parseResult);
      if (!gate.ok) return gate;
      const empty: SymbolExtraction = { symbols: [] };
      return ok(empty);
    },
    extractImports(parseResult) {
      const gate = ensureOwnParse(parseResult);
      if (!gate.ok) return gate;
      const empty: ImportExtraction = { imports: [] };
      return ok(empty);
    },
  };
}
