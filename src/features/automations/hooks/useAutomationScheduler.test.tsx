// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AutomationClaimResponse,
  AutomationTask,
  WorkspaceInfo,
} from "@/types";
import {
  automationsClaimDue,
  automationsRecordRunFinished,
} from "@services/tauri";
import {
  AUTOMATION_SCHEDULER_STARTUP_DELAY_MS,
  useAutomationScheduler,
} from "./useAutomationScheduler";

vi.mock("@services/tauri", () => ({
  automationsClaimDue: vi.fn(),
  automationsRecordRunFinished: vi.fn(),
}));

const automationsClaimDueMock = vi.mocked(automationsClaimDue);
const automationsRecordRunFinishedMock = vi.mocked(
  automationsRecordRunFinished,
);

function workspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: "workspace-1",
    name: "Project",
    path: "C:/repo",
    connected: true,
    settings: {
      sidebarCollapsed: false,
    },
    ...overrides,
  };
}

function task(overrides: Partial<AutomationTask> = {}): AutomationTask {
  return {
    id: "automation-1",
    title: "Daily summary",
    enabled: true,
    workspaceId: "workspace-1",
    prompt: "Summarize the project",
    schedule: { type: "interval", intervalMinutes: 30 },
    threadPolicy: { mode: "new" },
    executionDefaults: {
      modelId: "gpt-5",
      reasoningEffort: "medium",
      serviceTier: "fast",
      accessMode: "current",
      collaborationMode: { id: "plan" },
    },
    createdAtMs: 1,
    updatedAtMs: 1,
    lastTriggeredAtMs: null,
    nextRunAtMs: 2,
    ...overrides,
  };
}

function claimResponse(
  automationTaskOrTasks: AutomationTask | AutomationTask[] = task(),
): AutomationClaimResponse {
  const automationTasks = Array.isArray(automationTaskOrTasks)
    ? automationTaskOrTasks
    : [automationTaskOrTasks];
  return {
    claims: automationTasks.map((automationTask, index) => ({
        task: automationTask,
        run: {
          id: `run-${index + 1}`,
          taskId: automationTask.id,
          taskTitle: automationTask.title,
          workspaceId: automationTask.workspaceId,
          prompt: automationTask.prompt,
          status: "running",
          scheduledForMs: 2 + index,
          startedAtMs: 3 + index,
          finishedAtMs: null,
          threadId: null,
          error: null,
        },
      })),
    state: {
      tasks: automationTasks,
      runs: [],
    },
  };
}

async function runStartupTick() {
  await act(async () => {
    vi.advanceTimersByTime(AUTOMATION_SCHEDULER_STARTUP_DELAY_MS);
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
  });
}

describe("useAutomationScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    automationsRecordRunFinishedMock.mockResolvedValue({ tasks: [], runs: [] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("test_rq_002_frontend_scheduler_executes_claim: starts a new thread and sends the claimed automation prompt with saved defaults", async () => {
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-1");
    const sendUserMessageToThread = vi.fn().mockResolvedValue({ status: "sent" });
    automationsClaimDueMock.mockResolvedValueOnce(claimResponse());

    renderHook(() =>
      useAutomationScheduler({
        enabled: true,
        workspaces: [workspace()],
        threadStatusById: {},
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    await runStartupTick();

    expect(startThreadForWorkspace).toHaveBeenCalledWith("workspace-1", {
      activate: false,
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: "workspace-1" }),
      "thread-1",
      "Summarize the project",
      [],
      expect.objectContaining({
        model: "gpt-5",
        effort: "medium",
        serviceTier: "fast",
        accessMode: "current",
        collaborationMode: { id: "plan" },
      }),
    );
    expect(automationsRecordRunFinishedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        status: "completed",
        threadId: "thread-1",
      }),
    );
  });

  it("skips a continue-thread run when the target thread is processing", async () => {
    const startThreadForWorkspace = vi.fn();
    const sendUserMessageToThread = vi.fn();
    automationsClaimDueMock.mockResolvedValueOnce(
      claimResponse(
        task({
          threadPolicy: { mode: "continue", threadId: "busy-thread" },
        }),
      ),
    );

    renderHook(() =>
      useAutomationScheduler({
        enabled: true,
        workspaces: [workspace()],
        threadStatusById: { "busy-thread": { isProcessing: true } },
        startThreadForWorkspace,
        sendUserMessageToThread,
      }),
    );

    await runStartupTick();

    expect(startThreadForWorkspace).not.toHaveBeenCalled();
    expect(sendUserMessageToThread).not.toHaveBeenCalled();
    expect(automationsRecordRunFinishedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        status: "skipped",
        threadId: "busy-thread",
      }),
    );
  });

  it("test_rq_002_scheduler_completes_claim_batch_after_thread_state_change: keeps executing already claimed runs after send triggers a rerender", async () => {
    type SchedulerProps = Parameters<typeof useAutomationScheduler>[0];

    const startThreadForWorkspace = vi
      .fn()
      .mockResolvedValueOnce("thread-1")
      .mockResolvedValueOnce("thread-2");
    let rerenderScheduler: ((props: SchedulerProps) => void) | null = null;
    const sendUserMessageToThread = vi.fn().mockImplementation(async () => {
      if (sendUserMessageToThread.mock.calls.length === 1) {
        flushSync(() => {
          rerenderScheduler?.({
            ...initialProps,
            threadStatusById: { "thread-1": { isProcessing: true } },
          });
        });
        await Promise.resolve();
      }
      return { status: "sent" };
    });
    const initialProps: SchedulerProps = {
      enabled: true,
      workspaces: [workspace()],
      threadStatusById: {},
      startThreadForWorkspace,
      sendUserMessageToThread,
    };
    automationsClaimDueMock.mockResolvedValueOnce(
      claimResponse([
        task({ id: "automation-1", prompt: "First prompt" }),
        task({
          id: "automation-2",
          title: "Second task",
          prompt: "Second prompt",
        }),
      ]),
    );

    const { rerender } = renderHook(
      (props: SchedulerProps) => useAutomationScheduler(props),
      { initialProps },
    );
    rerenderScheduler = rerender;

    await runStartupTick();

    expect(startThreadForWorkspace).toHaveBeenCalledTimes(2);
    expect(sendUserMessageToThread).toHaveBeenCalledTimes(2);
    expect(automationsRecordRunFinishedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        status: "completed",
        threadId: "thread-1",
      }),
    );
    expect(automationsRecordRunFinishedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-2",
        status: "completed",
        threadId: "thread-2",
      }),
    );
  });

  it("test_rq_002_scheduler_waits_for_loaded_workspaces: does not claim due automations before workspace loading completes", async () => {
    automationsClaimDueMock.mockResolvedValueOnce({
      claims: [],
      state: { tasks: [], runs: [] },
    });

    renderHook(() =>
      useAutomationScheduler({
        enabled: true,
        workspacesLoaded: false,
        workspaces: [],
        threadStatusById: {},
        startThreadForWorkspace: vi.fn(),
        sendUserMessageToThread: vi.fn(),
      }),
    );

    await runStartupTick();

    expect(automationsClaimDueMock).not.toHaveBeenCalled();
  });
});
