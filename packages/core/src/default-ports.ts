import {
  createAnalyzerHost,
  createNoopPlugin,
  type LanguagePluginInfo as AnalyzerPluginInfo,
} from "@prism/analyzer";
import {
  createNodejsManifestDetector,
  createStackHost,
  createUnknownDetector,
  type StackDetectorInfo as IntelligenceDetectorInfo,
} from "@prism/intelligence";
import type {
  AnalyzerPort,
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

/** Default analyzer host with the noop test plugin registered. */
export function createDefaultAnalyzerPort(): AnalyzerPort {
  const host = createAnalyzerHost({ plugins: [createNoopPlugin()] });
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

/** Default stack host with unknown + nodejs-manifest stubs (M-040). */
export function createDefaultStackPort(): StackPort {
  const host = createStackHost({
    detectors: [createUnknownDetector(), createNodejsManifestDetector()],
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
