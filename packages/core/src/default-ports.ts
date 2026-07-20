import {
  createAnalyzerHost,
  createNoopPlugin,
  createTypescriptPlugin,
  type LanguagePluginInfo as AnalyzerPluginInfo,
} from "@prism/analyzer";
import { createIndexerEngine, type IndexerEngine } from "@prism/indexer";
import {
  createDefaultDetectorPacks,
  createStackHost,
  type StackDetectorInfo as IntelligenceDetectorInfo,
} from "@prism/intelligence";
import type {
  AnalyzerPort,
  IndexerPort,
  LanguagePluginInfo,
  StackDetectorInfo,
  StackPort,
} from "./ports.js";

function toCorePluginInfo(info: AnalyzerPluginInfo): LanguagePluginInfo {
  return {
    id: info.id,
    spiVersion: info.spiVersion,
    extensions: info.extensions,
    capabilities: info.capabilities,
  };
}

function toCoreDetectorInfo(info: IntelligenceDetectorInfo): StackDetectorInfo {
  return {
    id: info.id,
    spiVersion: info.spiVersion,
    domains: info.domains,
    personaHints: info.personaHints,
  };
}

/** Default analyzer host: Oxc TypeScript/JS plugin + noop scaffold. */
export function createDefaultAnalyzerPort(): AnalyzerPort {
  const host = createAnalyzerHost({
    plugins: [createTypescriptPlugin(), createNoopPlugin()],
  });
  return {
    id: host.id,
    listPlugins() {
      return host.listPlugins().map(toCorePluginInfo);
    },
    analyzeFile(absolutePath) {
      return host.analyzeFile(absolutePath);
    },
  };
}

/** Default indexer engine (inventory → analyze → IndexSnapshot). */
export function createDefaultIndexerPort(): IndexerPort {
  const engine: IndexerEngine = createIndexerEngine();
  return {
    id: engine.id,
    indexWorkspace(rootAbsolutePath, options) {
      return engine.indexWorkspace(rootAbsolutePath, options);
    },
  };
}

/** Default stack host with M-013 multi-domain detector packs. */
export function createDefaultStackPort(): StackPort {
  const host = createStackHost({
    detectors: createDefaultDetectorPacks(),
  });
  return {
    id: host.id,
    listDetectors() {
      return host.listDetectors().map(toCoreDetectorInfo);
    },
    detectProfile(rootAbsolutePath) {
      return host.detectProfile(rootAbsolutePath);
    },
  };
}
