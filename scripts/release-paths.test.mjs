import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldDeployWebsite, shouldPublish } from "./release-paths.mjs";

describe("shouldPublish", () => {
  it("publishes when package code changes", () => {
    assert.equal(shouldPublish(["packages/cli/src/commands/install.ts"]), true);
    assert.equal(shouldPublish(["packages/mcp-server/package.json"]), true);
  });

  it("skips a README, docs, and the website", () => {
    assert.equal(shouldPublish(["README.md"]), false);
    assert.equal(shouldPublish(["packages/cli/README.md"]), false);
    assert.equal(shouldPublish(["docs/start/install.mdx"]), false);
    assert.equal(shouldPublish(["apps/website/app/(home)/page.tsx"]), false);
    assert.equal(shouldPublish(["CHANGELOG.md"]), false);
  });

  it("publishes when code and a README change together", () => {
    assert.equal(
      shouldPublish(["packages/cli/README.md", "packages/cli/src/cli.ts"]),
      true,
    );
  });
});

describe("shouldDeployWebsite", () => {
  it("deploys the site and the docs it builds", () => {
    assert.equal(
      shouldDeployWebsite(["apps/website/app/(home)/page.tsx"]),
      true,
    );
    assert.equal(shouldDeployWebsite(["docs/start/install.mdx"]), true);
  });

  it("skips packages, the root README, and a package README", () => {
    assert.equal(shouldDeployWebsite(["packages/cli/src/cli.ts"]), false);
    assert.equal(shouldDeployWebsite(["README.md"]), false);
    assert.equal(shouldDeployWebsite(["packages/cli/README.md"]), false);
    assert.equal(shouldDeployWebsite(["apps/website/README.md"]), false);
    assert.equal(shouldDeployWebsite(["CHANGELOG.md"]), false);
  });
});
