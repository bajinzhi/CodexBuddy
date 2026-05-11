import { describe, expect, it } from "vitest";
import { resolvePetRuntimeState } from "@/features/pets/petRuntime";

const nowMs = 1_000_000;

describe("resolvePetRuntimeState", () => {
  it("prioritizes approval requests over other states", () => {
    expect(
      resolvePetRuntimeState({
        nowMs,
        hasApprovalRequest: true,
        hasUserInputRequest: true,
        processingStartedAtMs: nowMs - 180_000,
        lastCompletedAtMs: nowMs,
        idleSinceMs: nowMs - 400_000,
      }),
    ).toEqual({
      form: "alert",
      status: "needs_approval",
      label: "Needs approval",
    });
  });

  it("switches long-running work into the charged form", () => {
    expect(
      resolvePetRuntimeState({
        nowMs,
        hasApprovalRequest: false,
        hasUserInputRequest: false,
        processingStartedAtMs: nowMs - 120_000,
        lastCompletedAtMs: null,
        idleSinceMs: null,
      }),
    ).toMatchObject({
      form: "charged",
      status: "working",
    });
  });

  it("celebrates recent completion before becoming idle", () => {
    expect(
      resolvePetRuntimeState({
        nowMs,
        hasApprovalRequest: false,
        hasUserInputRequest: false,
        processingStartedAtMs: null,
        lastCompletedAtMs: nowMs - 5_500,
        idleSinceMs: nowMs - 5_500,
      }),
    ).toMatchObject({
      form: "normal",
      status: "celebrate",
    });
  });

  it("rests after five minutes of idle time", () => {
    expect(
      resolvePetRuntimeState({
        nowMs,
        hasApprovalRequest: false,
        hasUserInputRequest: false,
        processingStartedAtMs: null,
        lastCompletedAtMs: null,
        idleSinceMs: nowMs - 300_000,
      }),
    ).toMatchObject({
      form: "resting",
      status: "sleep",
    });
  });
});
