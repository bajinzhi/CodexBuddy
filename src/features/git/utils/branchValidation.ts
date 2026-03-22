export type BranchValidationErrorKey =
  | "git.branchValidation.dotOrDotDot"
  | "git.branchValidation.spaces"
  | "git.branchValidation.leadingOrTrailingSlash"
  | "git.branchValidation.doubleSlash"
  | "git.branchValidation.lockSuffix"
  | "git.branchValidation.doubleDot"
  | "git.branchValidation.atBrace"
  | "git.branchValidation.invalidCharacters"
  | "git.branchValidation.trailingDot";

export function validateBranchName(name: string): BranchValidationErrorKey | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed === "." || trimmed === "..") {
    return "git.branchValidation.dotOrDotDot";
  }
  if (/\s/.test(trimmed)) {
    return "git.branchValidation.spaces";
  }
  if (trimmed.startsWith("/") || trimmed.endsWith("/")) {
    return "git.branchValidation.leadingOrTrailingSlash";
  }
  if (trimmed.includes("//")) {
    return "git.branchValidation.doubleSlash";
  }
  if (trimmed.endsWith(".lock")) {
    return "git.branchValidation.lockSuffix";
  }
  if (trimmed.includes("..")) {
    return "git.branchValidation.doubleDot";
  }
  if (trimmed.includes("@{")) {
    return "git.branchValidation.atBrace";
  }
  const invalidChars = ["~", "^", ":", "?", "*", "[", "\\"];
  if (invalidChars.some((char) => trimmed.includes(char))) {
    return "git.branchValidation.invalidCharacters";
  }
  if (trimmed.endsWith(".")) {
    return "git.branchValidation.trailingDot";
  }
  return null;
}
