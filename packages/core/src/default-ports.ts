import {
  createAnalyzerHost,
  createNoopPlugin,
  type LanguagePluginInfo as AnalyzerPluginInfo,
} from "@prism/analyzer";
import type { AnalyzerPort, LanguagePluginInfo } from "./ports.js";

function toCoreInfo(info: AnalyzerPluginInfo): LanguagePluginInfo {
  return {
    id: info.id,
    spiVersion: info.spiVersion,
    extensions: info.extensions,
    capabilities: info.capabilities,
  };
}

/** Default analyzer host with the noop test plugin registered. */
export function createDefaultAnalyzerPort(): AnalyzerPort {
  const host = createAnalyzerHost({ plugins: [createNoopPlugin()] });
  return {
    id: host.id,
    listPlugins() {
      return host.listPlugins().map(toCoreInfo);
    },
    analyzeFile(absolutePath) {
      return host.analyzeFile(absolutePath);
    },
  };
}
