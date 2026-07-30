import { describe, expect, it } from "vitest";
import {
  classifyFileRole,
  fileRoleLabel,
  fileRoleRiskFloor,
} from "./file-role.js";

describe("classifyFileRole", () => {
  it("classifies common roles", () => {
    expect(classifyFileRole("src/index.ts")).toBe("barrel");
    expect(classifyFileRole("src/main.ts")).toBe("entry");
    expect(classifyFileRole("vitest.config.ts")).toBe("config");
    expect(classifyFileRole("src/util.test.ts")).toBe("test");
    expect(classifyFileRole("app/page.tsx")).toBe("route");
    expect(classifyFileRole("prisma/schema.prisma")).toBe("schema");
    expect(classifyFileRole("src/generated/types.ts")).toBe("generated");
    expect(classifyFileRole("fixtures/sample.ts")).toBe("fixture");
    expect(classifyFileRole("src/util.ts")).toBe("source");
  });

  it("exposes labels and floors", () => {
    expect(fileRoleLabel("barrel")).toBe("barrel");
    expect(fileRoleRiskFloor("entry")).toBeGreaterThan(0);
    expect(fileRoleRiskFloor("source")).toBe(0);
  });
});
