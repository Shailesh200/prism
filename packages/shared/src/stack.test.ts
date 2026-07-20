import { describe, expect, it } from "vitest";
import { DeveloperPersona, StackDomain } from "./stack.js";

describe("stack well-known ids", () => {
  it("covers primary domains and personas", () => {
    expect(StackDomain.FRONTEND).toBe("frontend");
    expect(StackDomain.DATA_ML_AI).toBe("data_ml_ai");
    expect(StackDomain.MOBILE).toBe("mobile");
    expect(DeveloperPersona.DATA_SCIENTIST).toBe("data_scientist");
    expect(DeveloperPersona.AI_ENGINEER).toBe("ai_engineer");
    expect(DeveloperPersona.QA_ENGINEER).toBe("qa_engineer");
  });
});
