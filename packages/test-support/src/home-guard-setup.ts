/**
 * vitest `setupFiles`: runs in every test worker before its tests and stops
 * the run if HOME or PRISM_HOME is the real home (see home-guard.ts).
 */
import { assertIsolatedHome } from "./home-guard.js";

assertIsolatedHome();
