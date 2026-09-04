/**
 * The wire contract, with nothing behind it.
 *
 * The package root pulls in `session.ts`, which imports Core — fine for the
 * IDE extension, wrong for the Prism Console, whose whole point is that Core
 * is not loaded until someone asks for intelligence (ADR-0048). This entry
 * point carries only types and the envelope guards, so a caller can validate
 * an HTTP body without paying for the engine.
 */

export * from "./protocol.js";
export * from "./protocol-guards.js";
