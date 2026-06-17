// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { ask } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceInfo } from "../../../types";
import { useSidebarLayoutActions } from "./useSidebarLayoutActions";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Workspace One",
  path: "/tmp/workspace-one",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useSidebarLayoutActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps handlers referentially stable across unrelated rerenders", () => {
    const options = {
      openSettings: vi.fn(),
      resetPullRequestSelection: vi.fn(),
      clearDraftState: vi.fn(),
      clearDraftStateIfDifferentWorkspace: vi.fn(),
      selectHome: vi.fn(),
      exitDiffView: vi.fn(),
      selectWorkspace: vi.fn(),
      setActiveThreadId: vi.fn(),
      connectWorkspace: vi.fn(async () => {}),
      isCompact: false,
      setActiveTab: vi.fn(),
      workspacesById: new Map([[workspace.id, workspace]]),
      updateWorkspaceSettings: vi.fn(async () => workspace),
      removeThread: vi.fn(),
      deleteThread: vi.fn(async () => {}),
      clearDraftForThread: vi.fn(),
      removeImagesForThread: vi.fn(),
      refreshThread: vi.fn(async () => {}),
      handleRenameThread: vi.fn(),
      removeWorkspace: vi.fn(async () => {}),
      removeWorktree: vi.fn(async () => {}),
      loadOlderThreadsForWorkspace: vi.fn(async () => {}),
      listThreadsForWorkspace: vi.fn(async () => {}),
    } as const;

    const { result, rerender } = renderHook(
      ({ tick }: { tick: number }) => {
        void tick;
        return useSidebarLayoutActions(options);
      },
      {
        initialProps: { tick: 0 },
      },
    );

    const firstRefs = {
      onSelectWorkspace: result.current.onSelectWorkspace,
      onSelectThread: result.current.onSelectThread,
      onArchiveThread: result.current.onArchiveThread,
      onDeleteThread: result.current.onDeleteThread,
      onLoadOlderThreads: result.current.onLoadOlderThreads,
    };

    rerender({ tick: 1 });

    expect(result.current.onSelectWorkspace).toBe(firstRefs.onSelectWorkspace);
    expect(result.current.onSelectThread).toBe(firstRefs.onSelectThread);
    expect(result.current.onArchiveThread).toBe(firstRefs.onArchiveThread);
    expect(result.current.onDeleteThread).toBe(firstRefs.onDeleteThread);
    expect(result.current.onLoadOlderThreads).toBe(firstRefs.onLoadOlderThreads);
  });

  it("selects a workspace through the standard sidebar flow", () => {
    const exitDiffView = vi.fn();
    const resetPullRequestSelection = vi.fn();
    const clearDraftStateIfDifferentWorkspace = vi.fn();
    const selectWorkspace = vi.fn();
    const setActiveThreadId = vi.fn();
    const { result } = renderHook(() =>
      useSidebarLayoutActions({
        openSettings: vi.fn(),
        resetPullRequestSelection,
        clearDraftState: vi.fn(),
        clearDraftStateIfDifferentWorkspace,
        selectHome: vi.fn(),
        exitDiffView,
        selectWorkspace,
        setActiveThreadId,
        connectWorkspace: vi.fn(async () => {}),
        isCompact: false,
        setActiveTab: vi.fn(),
        workspacesById: new Map([[workspace.id, workspace]]),
        updateWorkspaceSettings: vi.fn(async () => workspace),
        removeThread: vi.fn(),
        deleteThread: vi.fn(async () => {}),
        clearDraftForThread: vi.fn(),
        removeImagesForThread: vi.fn(),
        refreshThread: vi.fn(async () => {}),
        handleRenameThread: vi.fn(),
        removeWorkspace: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        loadOlderThreadsForWorkspace: vi.fn(async () => {}),
        listThreadsForWorkspace: vi.fn(async () => {}),
      }),
    );

    act(() => {
      result.current.onSelectWorkspace("ws-1");
    });

    expect(exitDiffView).toHaveBeenCalledTimes(1);
    expect(resetPullRequestSelection).toHaveBeenCalledTimes(1);
    expect(clearDraftStateIfDifferentWorkspace).toHaveBeenCalledWith("ws-1");
    expect(selectWorkspace).toHaveBeenCalledWith("ws-1");
    expect(setActiveThreadId).toHaveBeenCalledWith(null, "ws-1");
  });

  it("switches to codex tab after connecting in compact mode", async () => {
    const connectWorkspace = vi.fn(async () => {});
    const setActiveTab = vi.fn();
    const { result } = renderHook(() =>
      useSidebarLayoutActions({
        openSettings: vi.fn(),
        resetPullRequestSelection: vi.fn(),
        clearDraftState: vi.fn(),
        clearDraftStateIfDifferentWorkspace: vi.fn(),
        selectHome: vi.fn(),
        exitDiffView: vi.fn(),
        selectWorkspace: vi.fn(),
        setActiveThreadId: vi.fn(),
        connectWorkspace,
        isCompact: true,
        setActiveTab,
        workspacesById: new Map([[workspace.id, workspace]]),
        updateWorkspaceSettings: vi.fn(async () => workspace),
        removeThread: vi.fn(),
        deleteThread: vi.fn(async () => {}),
        clearDraftForThread: vi.fn(),
        removeImagesForThread: vi.fn(),
        refreshThread: vi.fn(async () => {}),
        handleRenameThread: vi.fn(),
        removeWorkspace: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        loadOlderThreadsForWorkspace: vi.fn(async () => {}),
        listThreadsForWorkspace: vi.fn(async () => {}),
      }),
    );

    await act(async () => {
      await result.current.onConnectWorkspace(workspace);
    });

    expect(connectWorkspace).toHaveBeenCalledWith(workspace);
    expect(setActiveTab).toHaveBeenCalledWith("codex");
  });

  it("forwards explicit settings sections", () => {
    const openSettings = vi.fn();
    const { result } = renderHook(() =>
      useSidebarLayoutActions({
        openSettings,
        resetPullRequestSelection: vi.fn(),
        clearDraftState: vi.fn(),
        clearDraftStateIfDifferentWorkspace: vi.fn(),
        selectHome: vi.fn(),
        exitDiffView: vi.fn(),
        selectWorkspace: vi.fn(),
        setActiveThreadId: vi.fn(),
        connectWorkspace: vi.fn(async () => {}),
        isCompact: false,
        setActiveTab: vi.fn(),
        workspacesById: new Map([[workspace.id, workspace]]),
        updateWorkspaceSettings: vi.fn(async () => workspace),
        removeThread: vi.fn(),
        deleteThread: vi.fn(async () => {}),
        clearDraftForThread: vi.fn(),
        removeImagesForThread: vi.fn(),
        refreshThread: vi.fn(async () => {}),
        handleRenameThread: vi.fn(),
        removeWorkspace: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        loadOlderThreadsForWorkspace: vi.fn(async () => {}),
        listThreadsForWorkspace: vi.fn(async () => {}),
      }),
    );

    act(() => {
      result.current.onOpenSettings("common-links");
    });

    expect(openSettings).toHaveBeenCalledWith("common-links");
  });

  it("archives threads without confirmation and clears local attachments", () => {
    const removeThread = vi.fn();
    const clearDraftForThread = vi.fn();
    const removeImagesForThread = vi.fn();
    const { result } = renderHook(() =>
      useSidebarLayoutActions({
        openSettings: vi.fn(),
        resetPullRequestSelection: vi.fn(),
        clearDraftState: vi.fn(),
        clearDraftStateIfDifferentWorkspace: vi.fn(),
        selectHome: vi.fn(),
        exitDiffView: vi.fn(),
        selectWorkspace: vi.fn(),
        setActiveThreadId: vi.fn(),
        connectWorkspace: vi.fn(async () => {}),
        isCompact: false,
        setActiveTab: vi.fn(),
        workspacesById: new Map([[workspace.id, workspace]]),
        updateWorkspaceSettings: vi.fn(async () => workspace),
        removeThread,
        deleteThread: vi.fn(async () => {}),
        clearDraftForThread,
        removeImagesForThread,
        refreshThread: vi.fn(async () => {}),
        handleRenameThread: vi.fn(),
        removeWorkspace: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        loadOlderThreadsForWorkspace: vi.fn(async () => {}),
        listThreadsForWorkspace: vi.fn(async () => {}),
      }),
    );

    act(() => {
      result.current.onArchiveThread("ws-1", "thread-1");
    });

    expect(ask).not.toHaveBeenCalled();
    expect(removeThread).toHaveBeenCalledWith("ws-1", "thread-1");
    expect(clearDraftForThread).toHaveBeenCalledWith("thread-1");
    expect(removeImagesForThread).toHaveBeenCalledWith("thread-1");
  });

  it("confirms before permanently deleting a thread", async () => {
    const deleteThread = vi.fn(async () => {});
    const clearDraftForThread = vi.fn();
    const removeImagesForThread = vi.fn();
    vi.mocked(ask).mockResolvedValueOnce(true);
    const { result } = renderHook(() =>
      useSidebarLayoutActions({
        openSettings: vi.fn(),
        resetPullRequestSelection: vi.fn(),
        clearDraftState: vi.fn(),
        clearDraftStateIfDifferentWorkspace: vi.fn(),
        selectHome: vi.fn(),
        exitDiffView: vi.fn(),
        selectWorkspace: vi.fn(),
        setActiveThreadId: vi.fn(),
        connectWorkspace: vi.fn(async () => {}),
        isCompact: false,
        setActiveTab: vi.fn(),
        workspacesById: new Map([[workspace.id, workspace]]),
        updateWorkspaceSettings: vi.fn(async () => workspace),
        removeThread: vi.fn(),
        deleteThread,
        clearDraftForThread,
        removeImagesForThread,
        refreshThread: vi.fn(async () => {}),
        handleRenameThread: vi.fn(),
        removeWorkspace: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        loadOlderThreadsForWorkspace: vi.fn(async () => {}),
        listThreadsForWorkspace: vi.fn(async () => {}),
      }),
    );

    await act(async () => {
      await result.current.onDeleteThread("ws-1", "thread-1");
    });

    expect(ask).toHaveBeenCalled();
    expect(deleteThread).toHaveBeenCalledWith("ws-1", "thread-1");
    expect(clearDraftForThread).toHaveBeenCalledWith("thread-1");
    expect(removeImagesForThread).toHaveBeenCalledWith("thread-1");
  });

  it("keeps local draft state when permanent thread deletion fails", async () => {
    const deleteThread = vi.fn(async () => {
      throw new Error("delete failed");
    });
    const clearDraftForThread = vi.fn();
    const removeImagesForThread = vi.fn();
    vi.mocked(ask).mockResolvedValueOnce(true);
    const { result } = renderHook(() =>
      useSidebarLayoutActions({
        openSettings: vi.fn(),
        resetPullRequestSelection: vi.fn(),
        clearDraftState: vi.fn(),
        clearDraftStateIfDifferentWorkspace: vi.fn(),
        selectHome: vi.fn(),
        exitDiffView: vi.fn(),
        selectWorkspace: vi.fn(),
        setActiveThreadId: vi.fn(),
        connectWorkspace: vi.fn(async () => {}),
        isCompact: false,
        setActiveTab: vi.fn(),
        workspacesById: new Map([[workspace.id, workspace]]),
        updateWorkspaceSettings: vi.fn(async () => workspace),
        removeThread: vi.fn(),
        deleteThread,
        clearDraftForThread,
        removeImagesForThread,
        refreshThread: vi.fn(async () => {}),
        handleRenameThread: vi.fn(),
        removeWorkspace: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        loadOlderThreadsForWorkspace: vi.fn(async () => {}),
        listThreadsForWorkspace: vi.fn(async () => {}),
      }),
    );

    await act(async () => {
      await result.current.onDeleteThread("ws-1", "thread-1");
    });

    expect(deleteThread).toHaveBeenCalledWith("ws-1", "thread-1");
    expect(clearDraftForThread).not.toHaveBeenCalled();
    expect(removeImagesForThread).not.toHaveBeenCalled();
  });
});
