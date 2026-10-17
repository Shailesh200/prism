import cli from "../../../packages/cli/package.json";

/** The published Prism version, read from the CLI package at build time. */
export const PRISM_VERSION: string = cli.version;
