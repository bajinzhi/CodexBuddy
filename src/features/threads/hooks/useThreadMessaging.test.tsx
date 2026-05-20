/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react";
import {
  sendUserMessage as sendUserMessageService,
  steerTurn as steerTurnService,
  startReview as startReviewService,
  interruptTurn as interruptTurnService,
  getAppsList as getAppsListService,
  listMcpServerStatus as listMcpServerStatusService,
  compactThread as compactThreadService,
  threadGoalClear as threadGoalClearService,
  threadGoalGet as threadGoalGetService,
  threadGoalSet as threadGoalSetService,
} from "@services/tauri";
import type { WorkspaceInfo } from "@/types";
import { setThreadGoal, STORAGE_KEY_THREAD_GOALS } from "@threads/utils/threadStorage";
import { useThreadMessaging } from "./useThreadMessaging";

vi.mock("@sentry/react", () => ({
  metrics: {
    count: vi.fn(),
  },
}));

vi.mock("@services/tauri", () => ({
  sendUserMessage: vi.fn(),
  steerTurn: vi.fn(),
  startReview: vi.fn(),
  interruptTurn: vi.fn(),
  getAppsList: vi.fn(),
  listMcpServerStatus: vi.fn(),
  compactThread: vi.fn(),
  threadGoalClear: vi.fn(),
  threadGoalGet: vi.fn(),
  threadGoalSet: vi.fn(),
}));

vi.mock("./useReviewPrompt", () => ({
  useReviewPrompt: () => ({
    reviewPrompt: null,
    openReviewPrompt: vi.fn(),
    closeReviewPrompt: vi.fn(),
    showPresetStep: vi.fn(),
    choosePreset: vi.fn(),
    highlightedPresetIndex: 0,
    setHighlightedPresetIndex: vi.fn(),
    highlightedBranchIndex: 0,
    setHighlightedBranchIndex: vi.fn(),
    highlightedCommitIndex: 0,
    setHighlightedCommitIndex: vi.fn(),
    handleReviewPromptKeyDown: vi.fn(() => false),
    confirmBranch: vi.fn(),
    selectBranch: vi.fn(),
    selectBranchAtIndex: vi.fn(),
    selectCommit: vi.fn(),
    selectCommitAtIndex: vi.fn(),
    confirmCommit: vi.fn(),
    updateCustomInstructions: vi.fn(),
    confirmCustom: vi.fn(),
  }),
}));

describe("useThreadMessaging telemetry", () => {
  const workspace: WorkspaceInfo = {
    id: "ws-1",
    name: "Workspace",
    path: "/tmp/workspace",
    connected: true,
    settings: {
      sidebarCollapsed: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendUserMessageService).mockResolvedValue({
      result: {
        turn: { id: "turn-1" },
      },
    } as unknown as Awaited<ReturnType<typeof sendUserMessageService>>);
    vi.mocked(steerTurnService).mockResolvedValue(
      {
        result: {
          turnId: "turn-1",
        },
      } as unknown as Awaited<ReturnType<typeof steerTurnService>>,
    );
    vi.mocked(startReviewService).mockResolvedValue(
      {} as Awaited<ReturnType<typeof startReviewService>>,
    );
    vi.mocked(interruptTurnService).mockResolvedValue(
      {} as Awaited<ReturnType<typeof interruptTurnService>>,
    );
    vi.mocked(getAppsListService).mockResolvedValue(
      {} as Awaited<ReturnType<typeof getAppsListService>>,
    );
    vi.mocked(listMcpServerStatusService).mockResolvedValue(
      {} as Awaited<ReturnType<typeof listMcpServerStatusService>>,
    );
    vi.mocked(compactThreadService).mockResolvedValue(
      {} as Awaited<ReturnType<typeof compactThreadService>>,
    );
    vi.mocked(threadGoalGetService).mockResolvedValue(
      {
        goal: null,
      } as Awaited<ReturnType<typeof threadGoalGetService>>,
    );
    vi.mocked(threadGoalSetService).mockImplementation(async (_workspaceId, threadId, options) => ({
      goal:
        options.objective && typeof options.objective === "string"
          ? {
            threadId,
            objective: options.objective,
            status: options.status ?? "active",
            createdAt: 1,
            updatedAt: 2,
          }
          : null,
    }) as Awaited<ReturnType<typeof threadGoalSetService>>);
    vi.mocked(threadGoalClearService).mockResolvedValue(
      {
        cleared: true,
      } as Awaited<ReturnType<typeof threadGoalClearService>>,
    );
    window.localStorage.clear();
  });

  const makeThreadMessagingOptions = (
    overrides: Partial<Parameters<typeof useThreadMessaging>[0]> = {},
  ): Parameters<typeof useThreadMessaging>[0] => ({
    activeWorkspace: workspace,
    activeThreadId: "thread-1",
    accessMode: "current",
    model: null,
    effort: null,
    collaborationMode: null,
    reviewDeliveryMode: "inline",
    steerEnabled: false,
    customPrompts: [],
    threadStatusById: {},
    activeTurnIdByThread: {},
    rateLimitsByWorkspace: {},
    pendingInterruptsRef: { current: new Set<string>() },
    dispatch: vi.fn(),
    getCustomName: vi.fn(() => undefined),
    markProcessing: vi.fn(),
    markReviewing: vi.fn(),
    setActiveTurnId: vi.fn(),
    recordThreadActivity: vi.fn(),
    safeMessageActivity: vi.fn(),
    onDebug: vi.fn(),
    pushThreadErrorMessage: vi.fn(),
    ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
    ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
    refreshThread: vi.fn(async () => null),
    forkThreadForWorkspace: vi.fn(async () => null),
    updateThreadParent: vi.fn(),
    ...overrides,
  });

  it("records prompt_sent once for one message send", async () => {
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: false,
        customPrompts: [],
        ensureWorkspaceRuntimeCodexArgs,
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "hello",
        [],
      );
    });

    expect(Sentry.metrics.count).toHaveBeenCalledTimes(1);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      "prompt_sent",
      1,
      expect.objectContaining({
        attributes: expect.objectContaining({
          workspace_id: "ws-1",
          thread_id: "thread-1",
          has_images: "false",
          has_attachments: "false",
          text_length: "5",
        }),
      }),
    );
    expect(ensureWorkspaceRuntimeCodexArgs).toHaveBeenCalledTimes(1);
    expect(ensureWorkspaceRuntimeCodexArgs).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("injects an active local fallback goal into the next turn/start", async () => {
    setThreadGoal("ws-1", "thread-1", "ship the release", {
      backendSynced: false,
    });
    const { result } = renderHook(() =>
      useThreadMessaging(makeThreadMessagingOptions()),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "write the checklist",
        [],
      );
    });

    expect(sendUserMessageService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      expect.stringContaining("Current thread goal:\n\nship the release"),
      expect.any(Object),
    );
    expect(sendUserMessageService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      expect.stringContaining("User request:\n\nwrite the checklist"),
      expect.any(Object),
    );
  });

  it("does not inject a goal that is already synced to Codex", async () => {
    setThreadGoal("ws-1", "thread-1", "ship the release", {
      backendSynced: true,
    });
    const { result } = renderHook(() =>
      useThreadMessaging(makeThreadMessagingOptions()),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "write the checklist",
        [],
      );
    });

    expect(sendUserMessageService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "write the checklist",
      expect.any(Object),
    );
  });

  it("forwards explicit app mentions to turn/start", async () => {
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: false,
        customPrompts: [],
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessage("hello $calendar", [], [
        { name: "Calendar App", path: "app://connector_calendar" },
      ]);
    });

    expect(sendUserMessageService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "hello $calendar",
      expect.objectContaining({
        appMentions: [{ name: "Calendar App", path: "app://connector_calendar" }],
      }),
    );
  });

  it("forwards the selected service tier to turn/start", async () => {
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        serviceTier: "fast",
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: false,
        customPrompts: [],
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessage("hello");
    });

    expect(sendUserMessageService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "hello",
      expect.objectContaining({
        serviceTier: "fast",
      }),
    );
  });

  it("omits service tier when no override is selected", async () => {
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        serviceTier: undefined,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: false,
        customPrompts: [],
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessage("hello");
    });

    expect(sendUserMessageService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "hello",
      expect.not.objectContaining({
        serviceTier: expect.anything(),
      }),
    );
  });

  it("does not forward service tier to review/start", async () => {
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        serviceTier: "fast",
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: false,
        customPrompts: [],
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.startUncommittedReview();
    });

    expect(startReviewService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      { type: "uncommittedChanges" },
      "inline",
    );
  });

  it("toggles fast mode through the built-in handler", async () => {
    const dispatch = vi.fn();
    const onSelectServiceTier = vi.fn();
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        serviceTier: null,
        collaborationMode: null,
        onSelectServiceTier,
        reviewDeliveryMode: "inline",
        steerEnabled: false,
        customPrompts: [],
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch,
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.startFast("/fast on");
    });

    expect(onSelectServiceTier).toHaveBeenCalledWith("fast");
    expect(dispatch).toHaveBeenCalledWith({
      type: "addAssistantMessage",
      threadId: "thread-1",
      text: "Fast mode enabled.",
    });
  });

  it("sets, pauses, resumes, and clears a thread goal", async () => {
    const dispatch = vi.fn();
    let objective = "";
    vi.mocked(threadGoalSetService).mockImplementation(async (_workspaceId, threadId, options) => {
      if (typeof options.objective === "string") {
        objective = options.objective;
      }
      return {
        goal: objective
          ? {
            threadId,
            objective,
            status: options.status ?? "active",
            createdAt: 1,
            updatedAt: 2,
          }
          : null,
      } as Awaited<ReturnType<typeof threadGoalSetService>>;
    });
    const { result } = renderHook(() =>
      useThreadMessaging(makeThreadMessagingOptions({ dispatch })),
    );

    await act(async () => {
      await result.current.startGoal("/goal ship the next release");
    });

    expect(threadGoalSetService).toHaveBeenLastCalledWith("ws-1", "thread-1", {
      objective: "ship the next release",
      status: "active",
    });
    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY_THREAD_GOALS) ?? "{}",
    ) as Record<string, { objective?: string; status?: string; backendSynced?: boolean }>;
    expect(persisted["ws-1:thread-1"]).toEqual(
      expect.objectContaining({
        objective: "ship the next release",
        status: "active",
        backendSynced: true,
      }),
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "addAssistantMessage",
      threadId: "thread-1",
      text: expect.stringContaining("Goal set for this thread."),
    });

    await act(async () => {
      await result.current.startGoal("/goal pause");
    });
    expect(threadGoalSetService).toHaveBeenLastCalledWith("ws-1", "thread-1", {
      status: "paused",
    });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "addAssistantMessage",
      threadId: "thread-1",
      text: expect.stringContaining("- Status: paused"),
    });

    await act(async () => {
      await result.current.startGoal("/goal resume");
    });
    expect(threadGoalSetService).toHaveBeenLastCalledWith("ws-1", "thread-1", {
      status: "active",
    });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "addAssistantMessage",
      threadId: "thread-1",
      text: expect.stringContaining("- Status: active"),
    });

    await act(async () => {
      await result.current.startGoal("/goal clear");
    });
    expect(threadGoalClearService).toHaveBeenLastCalledWith("ws-1", "thread-1");
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "addAssistantMessage",
      threadId: "thread-1",
      text: "Goal cleared for this thread.",
    });
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY_THREAD_GOALS) ?? "{}")[
        "ws-1:thread-1"
      ],
    ).toBeUndefined();
  });

  it("falls back to a local goal when the Codex goal RPC is unavailable", async () => {
    vi.mocked(threadGoalSetService).mockRejectedValueOnce(new Error("method not found"));
    const dispatch = vi.fn();
    const { result } = renderHook(() =>
      useThreadMessaging(makeThreadMessagingOptions({ dispatch })),
    );

    await act(async () => {
      await result.current.startGoal("/goal ship the next release");
    });

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY_THREAD_GOALS) ?? "{}",
    ) as Record<string, { objective?: string; status?: string; backendSynced?: boolean }>;
    expect(persisted["ws-1:thread-1"]).toEqual(
      expect.objectContaining({
        objective: "ship the next release",
        status: "active",
        backendSynced: false,
      }),
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "addAssistantMessage",
      threadId: "thread-1",
      text: expect.stringContaining("Future messages will include it automatically."),
    });
  });

  it("falls back to a local goal when the goal RPC returns an error payload", async () => {
    vi.mocked(threadGoalSetService).mockResolvedValueOnce({
      error: { message: "method not found" },
    } as unknown as Awaited<ReturnType<typeof threadGoalSetService>>);
    const dispatch = vi.fn();
    const { result } = renderHook(() =>
      useThreadMessaging(makeThreadMessagingOptions({ dispatch })),
    );

    await act(async () => {
      await result.current.startGoal("/goal ship the next release");
    });

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY_THREAD_GOALS) ?? "{}",
    ) as Record<string, { objective?: string; status?: string; backendSynced?: boolean }>;
    expect(persisted["ws-1:thread-1"]).toEqual(
      expect.objectContaining({
        objective: "ship the next release",
        status: "active",
        backendSynced: false,
      }),
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "addAssistantMessage",
      threadId: "thread-1",
      text: expect.stringContaining("Future messages will include it automatically."),
    });
  });

  it("uses turn/steer when steer mode is enabled and an active turn is present", async () => {
    const dispatch = vi.fn();
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: true,
        customPrompts: [],
        ensureWorkspaceRuntimeCodexArgs,
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            hasUnread: false,
            processingStartedAt: 0,
            lastDurationMs: null,
          },
        },
        activeTurnIdByThread: {
          "thread-1": "turn-1",
        },
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch,
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "steer this",
        [],
      );
    });

    expect(steerTurnService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "turn-1",
      "steer this",
      [],
    );
    expect(sendUserMessageService).not.toHaveBeenCalled();
    expect(ensureWorkspaceRuntimeCodexArgs).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "upsertItem" }),
    );
  });

  it("uses turn/start for document attachments even when steer is enabled", async () => {
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: true,
        customPrompts: [],
        ensureWorkspaceRuntimeCodexArgs,
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            hasUnread: false,
            processingStartedAt: 0,
            lastDurationMs: null,
          },
        },
        activeTurnIdByThread: {
          "thread-1": "turn-1",
        },
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "review this",
        ["/tmp/spec.pdf"],
      );
    });

    expect(steerTurnService).not.toHaveBeenCalled();
    expect(sendUserMessageService).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "review this",
      expect.objectContaining({
        attachments: ["/tmp/spec.pdf"],
      }),
    );
    expect(ensureWorkspaceRuntimeCodexArgs).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("resets stale processing state when turn/steer reports no active turn", async () => {
    const pushThreadErrorMessage = vi.fn();
    const markProcessing = vi.fn();
    const setActiveTurnId = vi.fn();
    vi.mocked(steerTurnService).mockResolvedValueOnce({
      error: { message: "no active turn to steer" },
    } as unknown as Awaited<ReturnType<typeof steerTurnService>>);

    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: true,
        customPrompts: [],
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            hasUnread: false,
            processingStartedAt: 0,
            lastDurationMs: null,
          },
        },
        activeTurnIdByThread: {
          "thread-1": "turn-1",
        },
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing,
        markReviewing: vi.fn(),
        setActiveTurnId,
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage,
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      const sendResult = await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "steer should fail",
        [],
      );
      expect(sendResult).toEqual({ status: "steer_failed" });
    });

    expect(steerTurnService).toHaveBeenCalledTimes(1);
    expect(sendUserMessageService).not.toHaveBeenCalled();
    expect(markProcessing).toHaveBeenCalledWith("thread-1", true);
    expect(markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    expect(pushThreadErrorMessage).toHaveBeenCalledWith(
      "thread-1",
      "Turn steer failed: no active turn to steer",
    );
  });

  it("keeps processing state for non-stale turn/steer rpc errors", async () => {
    const pushThreadErrorMessage = vi.fn();
    const markProcessing = vi.fn();
    const setActiveTurnId = vi.fn();
    vi.mocked(steerTurnService).mockResolvedValueOnce({
      error: { message: "steer request timed out" },
    } as unknown as Awaited<ReturnType<typeof steerTurnService>>);

    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: true,
        customPrompts: [],
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            hasUnread: false,
            processingStartedAt: 0,
            lastDurationMs: null,
          },
        },
        activeTurnIdByThread: {
          "thread-1": "turn-1",
        },
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing,
        markReviewing: vi.fn(),
        setActiveTurnId,
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage,
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      const sendResult = await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "steer timeout",
        [],
      );
      expect(sendResult).toEqual({ status: "steer_failed" });
    });

    expect(steerTurnService).toHaveBeenCalledTimes(1);
    expect(sendUserMessageService).not.toHaveBeenCalled();
    expect(markProcessing).toHaveBeenCalledWith("thread-1", true);
    expect(markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(setActiveTurnId).not.toHaveBeenCalledWith("thread-1", null);
    expect(pushThreadErrorMessage).toHaveBeenCalledWith(
      "thread-1",
      "Turn steer failed: steer request timed out",
    );
  });

  it("returns steer_failed and keeps processing state when turn/steer throws", async () => {
    const pushThreadErrorMessage = vi.fn();
    const markProcessing = vi.fn();
    const setActiveTurnId = vi.fn();
    vi.mocked(steerTurnService).mockRejectedValueOnce(
      new Error("steer network failure"),
    );

    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "inline",
        steerEnabled: true,
        customPrompts: [],
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            hasUnread: false,
            processingStartedAt: 0,
            lastDurationMs: null,
          },
        },
        activeTurnIdByThread: {
          "thread-1": "turn-1",
        },
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing,
        markReviewing: vi.fn(),
        setActiveTurnId,
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage,
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-1"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-1"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      const sendResult = await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "steer exception",
        [],
      );
      expect(sendResult).toEqual({ status: "steer_failed" });
    });

    expect(sendUserMessageService).not.toHaveBeenCalled();
    expect(markProcessing).toHaveBeenCalledWith("thread-1", true);
    expect(markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(setActiveTurnId).not.toHaveBeenCalledWith("thread-1", null);
    expect(pushThreadErrorMessage).toHaveBeenCalledWith(
      "thread-1",
      "Turn steer failed: steer network failure",
    );
  });

  it("routes uncommitted review to an explicit workspace override", async () => {
    const ensureThreadForActiveWorkspace = vi.fn(async () => "thread-active");
    const ensureThreadForWorkspace = vi.fn(async () => "thread-override");

    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-active",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "detached",
        steerEnabled: false,
        customPrompts: [],
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace,
        ensureThreadForWorkspace,
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.startUncommittedReview("ws-2");
    });

    expect(ensureThreadForActiveWorkspace).not.toHaveBeenCalled();
    expect(ensureThreadForWorkspace).toHaveBeenCalledWith("ws-2");
    expect(startReviewService).toHaveBeenCalledWith(
      "ws-2",
      "thread-override",
      { type: "uncommittedChanges" },
      "detached",
    );
  });

  it("names detached commit review child threads from commit context", async () => {
    vi.mocked(startReviewService).mockResolvedValueOnce({
      result: {
        review_thread_id: "thread-review-1",
      },
    } as unknown as Awaited<ReturnType<typeof startReviewService>>);
    const renameThread = vi.fn();

    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-parent",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        reviewDeliveryMode: "detached",
        steerEnabled: false,
        customPrompts: [],
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(() => undefined),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(async () => "thread-parent"),
        ensureThreadForWorkspace: vi.fn(async () => "thread-parent"),
        refreshThread: vi.fn(async () => null),
        forkThreadForWorkspace: vi.fn(async () => null),
        updateThreadParent: vi.fn(),
        renameThread,
      }),
    );

    await act(async () => {
      await result.current.startReview(
        "/review commit abcdef1234567890 Tighten sidebar commit selection",
      );
    });

    expect(renameThread).toHaveBeenCalledWith(
      "ws-1",
      "thread-review-1",
      "Review abcdef1: Tighten sidebar commit…",
    );
  });
});
