export type PetFormId = "normal" | "active" | "alert" | "resting" | "charged";

export type PetRuntimeStatus =
  | "idle"
  | "working"
  | "needs_input"
  | "needs_approval"
  | "celebrate"
  | "sleep";

export type PetRuntimeState = {
  form: PetFormId;
  status: PetRuntimeStatus;
  label: string;
};

export type ResolvePetRuntimeStateInput = {
  nowMs: number;
  hasApprovalRequest: boolean;
  hasUserInputRequest: boolean;
  processingStartedAtMs: number | null;
  lastCompletedAtMs: number | null;
  idleSinceMs: number | null;
};

const CHARGED_AFTER_MS = 120_000;
const CELEBRATE_FOR_MS = 6_000;
const SLEEP_AFTER_MS = 300_000;

export function resolvePetRuntimeState({
  nowMs,
  hasApprovalRequest,
  hasUserInputRequest,
  processingStartedAtMs,
  lastCompletedAtMs,
  idleSinceMs,
}: ResolvePetRuntimeStateInput): PetRuntimeState {
  if (hasApprovalRequest) {
    return {
      form: "alert",
      status: "needs_approval",
      label: "Needs approval",
    };
  }
  if (hasUserInputRequest) {
    return {
      form: "alert",
      status: "needs_input",
      label: "Needs input",
    };
  }
  if (processingStartedAtMs !== null) {
    if (nowMs - processingStartedAtMs >= CHARGED_AFTER_MS) {
      return {
        form: "charged",
        status: "working",
        label: "Deep work",
      };
    }
    return {
      form: "active",
      status: "working",
      label: "Working",
    };
  }
  if (lastCompletedAtMs !== null && nowMs - lastCompletedAtMs <= CELEBRATE_FOR_MS) {
    return {
      form: "normal",
      status: "celebrate",
      label: "Done",
    };
  }
  if (idleSinceMs !== null && nowMs - idleSinceMs >= SLEEP_AFTER_MS) {
    return {
      form: "resting",
      status: "sleep",
      label: "Resting",
    };
  }
  return {
    form: "normal",
    status: "idle",
    label: "Idle",
  };
}
