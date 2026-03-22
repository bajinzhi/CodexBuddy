import { describe, expect, it } from "vitest";
import { validateBranchName } from "./branchValidation";

describe("validateBranchName", () => {
  it("returns null for valid names", () => {
    expect(validateBranchName("feature/add-login")).toBeNull();
    expect(validateBranchName(" release/v1 ")).toBeNull();
  });

  it("rejects invalid names", () => {
    expect(validateBranchName(".")).toBe("git.branchValidation.dotOrDotDot");
    expect(validateBranchName("hello world")).toBe("git.branchValidation.spaces");
    expect(validateBranchName("feature//oops")).toBe("git.branchValidation.doubleSlash");
    expect(validateBranchName("feature..oops")).toBe("git.branchValidation.doubleDot");
    expect(validateBranchName("topic@{x")).toBe("git.branchValidation.atBrace");
  });
});
