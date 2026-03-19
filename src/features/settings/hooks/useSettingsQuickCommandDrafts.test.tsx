// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import { useSettingsQuickCommandDrafts } from "./useSettingsQuickCommandDrafts";

function buildAppSettings(): AppSettings {
  return {
    codexBin: null,
    codexArgs: null,
    backendMode: "local",
    remoteBackendProvider: "tcp",
    remoteBackendHost: "127.0.0.1:4732",
    remoteBackendToken: null,
    remoteBackends: [],
    activeRemoteBackendId: null,
    keepDaemonRunningAfterAppClose: false,
    defaultAccessMode: "current",
    reviewDeliveryMode: "inline",
    composerModelShortcut: null,
    composerAccessShortcut: null,
    composerReasoningShortcut: null,
    composerCollaborationShortcut: null,
    interruptShortcut: null,
    newAgentShortcut: null,
    newWorktreeAgentShortcut: null,
    newCloneAgentShortcut: null,
    archiveThreadShortcut: null,
    toggleProjectsSidebarShortcut: null,
    toggleGitSidebarShortcut: null,
    branchSwitcherShortcut: null,
    toggleDebugPanelShortcut: null,
    toggleTerminalShortcut: null,
    cycleAgentNextShortcut: null,
    cycleAgentPrevShortcut: null,
    cycleWorkspaceNextShortcut: null,
    cycleWorkspacePrevShortcut: null,
    lastComposerModelId: null,
    lastComposerReasoningEffort: null,
    uiScale: 1,
    uiLanguage: "system",
    theme: "system",
    accentColor: "blue",
    usageShowRemaining: true,
    showMessageFilePath: false,
    chatHistoryScrollbackItems: null,
    threadTitleAutogenerationEnabled: true,
    automaticAppUpdateChecksEnabled: true,
    uiFontFamily: "system-ui",
    codeFontFamily: "ui-monospace",
    codeFontSize: 12,
    notificationSoundsEnabled: true,
    systemNotificationsEnabled: true,
    subagentSystemNotificationsEnabled: true,
    splitChatDiffView: false,
    preloadGitDiffs: true,
    gitDiffIgnoreWhitespaceChanges: false,
    commitMessagePrompt: "{diff}",
    commitMessageModelId: null,
    collaborationModesEnabled: true,
    steerEnabled: true,
    followUpMessageBehavior: "queue",
    composerFollowUpHintEnabled: true,
    pauseQueuedMessagesWhenResponseRequired: true,
    unifiedExecEnabled: true,
    experimentalAppsEnabled: false,
    personality: "friendly",
    dictationEnabled: false,
    dictationModelId: "base",
    dictationPreferredLanguage: null,
    dictationHoldKey: null,
    composerEditorPreset: "default",
    composerFenceExpandOnSpace: false,
    composerFenceExpandOnEnter: false,
    composerFenceLanguageTags: false,
    composerFenceWrapSelection: false,
    composerFenceAutoWrapPasteMultiline: false,
    composerFenceAutoWrapPasteCodeLike: false,
    composerListContinuation: false,
    composerCodeBlockCopyUseModifier: false,
    quickCommands: [
      {
        id: "quick-1",
        label: "Initial",
        text: "First draft",
      },
    ],
    workspaceGroups: [],
    globalWorktreesFolder: null,
    openAppTargets: [],
    selectedOpenAppId: "vscode",
    commonLinks: [],
  };
}

describe("useSettingsQuickCommandDrafts", () => {
  it("commits the latest local quick-command draft instead of stale props", async () => {
    const appSettings = buildAppSettings();
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useSettingsQuickCommandDrafts({
        appSettings,
        onUpdateAppSettings,
      }),
    );

    act(() => {
      result.current.handleQuickCommandDraftChange("quick-1", {
        label: "Updated label",
      });
      result.current.handleQuickCommandDraftChange("quick-1", {
        text: "Updated body",
      });
    });

    await act(async () => {
      result.current.handleCommitQuickCommandDrafts();
    });

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        quickCommands: [
          {
            id: "quick-1",
            label: "Updated label",
            text: "Updated body",
          },
        ],
      }),
    );
  });
});
