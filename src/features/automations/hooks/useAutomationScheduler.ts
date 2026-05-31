import { useEffect, useRef } from "react";
import type {
  AutomationClaimedRun,
  AutomationRunStatus,
  AutomationState,
  DebugEntry,
  SendMessageResult,
  WorkspaceInfo,
} from "@/types";
import {
  automationsClaimDue,
  automationsRecordRunFinished,
} from "@services/tauri";
import type { SendMessageOptions } from "@/features/threads/hooks/threadMessagingHelpers";

export const AUTOMATION_SCHEDULER_STARTUP_DELAY_MS = 5_000;
export const AUTOMATION_SCHEDULER_INTERVAL_MS = 60_000;

type AutomationThreadStatus = {
  isProcessing?: boolean | null;
};

type StartThreadForWorkspace = (
  workspaceId: string,
  options?: { activate?: boolean },
) => Promise<string | null>;

type SendUserMessageToThread = (
  workspace: WorkspaceInfo,
  threadId: string,
  text: string,
  images?: string[],
  options?: SendMessageOptions,
) => Promise<SendMessageResult>;

type UseAutomationSchedulerOptions = {
  enabled?: boolean;
  workspacesLoaded?: boolean;
  workspaces: WorkspaceInfo[];
  threadStatusById: Record<string, AutomationThreadStatus | undefined>;
  startThreadForWorkspace: StartThreadForWorkspace;
  sendUserMessageToThread: SendUserMessageToThread;
  onStateChange?: (state: AutomationState) => void;
  onDebug?: (entry: DebugEntry) => void;
};

function buildSendOptions(
  claim: AutomationClaimedRun,
): SendMessageOptions {
  const defaults = claim.task.executionDefaults ?? {};
  return {
    skipPromptExpansion: true,
    model: defaults.modelId ?? null,
    effort: defaults.reasoningEffort ?? null,
    serviceTier: defaults.serviceTier ?? null,
    accessMode: defaults.accessMode ?? undefined,
    collaborationMode: defaults.collaborationMode ?? null,
    sendIntent: "default",
  };
}

function debugEntry(label: string, payload: unknown): DebugEntry {
  return {
    id: `${Date.now()}-automation-${label.replace(/[^a-z0-9]+/gi, "-")}`,
    timestamp: Date.now(),
    source: "client",
    label,
    payload,
  };
}

export function useAutomationScheduler({
  enabled = true,
  workspacesLoaded = true,
  workspaces,
  threadStatusById,
  startThreadForWorkspace,
  sendUserMessageToThread,
  onStateChange,
  onDebug,
}: UseAutomationSchedulerOptions) {
  const runningRef = useRef(false);
  const latestRef = useRef({
    workspaces,
    threadStatusById,
    startThreadForWorkspace,
    sendUserMessageToThread,
    onStateChange,
    onDebug,
  });
  latestRef.current = {
    workspaces,
    threadStatusById,
    startThreadForWorkspace,
    sendUserMessageToThread,
    onStateChange,
    onDebug,
  };

  useEffect(() => {
    if (!enabled || !workspacesLoaded) {
      return undefined;
    }

    let canceled = false;

    const finishRun = async (
      runId: string,
      status: AutomationRunStatus,
      threadId: string | null,
      error?: string | null,
    ) => {
      const state = await automationsRecordRunFinished({
        runId,
        status,
        threadId,
        error: error ?? null,
        finishedAtMs: Date.now(),
      });
      if (!canceled) {
        latestRef.current.onStateChange?.(state);
      }
    };

    const executeClaim = async (claim: AutomationClaimedRun) => {
      const workspace = latestRef.current.workspaces.find(
        (candidate) => candidate.id === claim.task.workspaceId,
      );
      if (!workspace) {
        await finishRun(
          claim.run.id,
          "failed",
          null,
          `Workspace not found: ${claim.task.workspaceId}`,
        );
        return;
      }

      let threadId: string | null = null;
      try {
        if (claim.task.threadPolicy.mode === "continue") {
          threadId = claim.task.threadPolicy.threadId;
          if (latestRef.current.threadStatusById[threadId]?.isProcessing) {
            await finishRun(
              claim.run.id,
              "skipped",
              threadId,
              "Target thread is processing",
            );
            return;
          }
        } else {
          threadId = await latestRef.current.startThreadForWorkspace(
            workspace.id,
            {
              activate: false,
            },
          );
          if (!threadId) {
            await finishRun(claim.run.id, "failed", null, "Thread start failed");
            return;
          }
        }

        const result = await latestRef.current.sendUserMessageToThread(
          workspace,
          threadId,
          claim.task.prompt,
          [],
          buildSendOptions(claim),
        );
        if (result.status === "sent") {
          await finishRun(claim.run.id, "completed", threadId, null);
        } else {
          await finishRun(
            claim.run.id,
            "failed",
            threadId,
            `Send blocked: ${result.status}`,
          );
        }
      } catch (error) {
        await finishRun(
          claim.run.id,
          "failed",
          threadId,
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    const claimAndRun = async () => {
      if (runningRef.current || canceled) {
        return;
      }
      runningRef.current = true;
      try {
        const response = await automationsClaimDue();
        if (canceled) {
          return;
        }
        latestRef.current.onStateChange?.(response.state);
        for (const claim of response.claims) {
          if (canceled) {
            break;
          }
          await executeClaim(claim);
        }
      } catch (error) {
        latestRef.current.onDebug?.(
          debugEntry(
            "automations/scheduler error",
            error instanceof Error ? error.message : String(error),
          ),
        );
      } finally {
        runningRef.current = false;
      }
    };

    const startupTimer = window.setTimeout(
      () => void claimAndRun(),
      AUTOMATION_SCHEDULER_STARTUP_DELAY_MS,
    );
    const interval = window.setInterval(
      () => void claimAndRun(),
      AUTOMATION_SCHEDULER_INTERVAL_MS,
    );

    return () => {
      canceled = true;
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, [enabled, workspacesLoaded]);
}
