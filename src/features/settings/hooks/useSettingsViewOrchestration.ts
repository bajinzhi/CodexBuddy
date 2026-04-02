import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  AppSettings,
  CodexDoctorResult,
  CodexUpdateCheckResult,
  CodexUpdateResult,
  DictationModelStatus,
  WorkspaceGroup,
  WorkspaceSettings,
} from "@/types";
import { isMacPlatform, isWindowsPlatform } from "@utils/platformPaths";
import { useSettingsOpenAppDrafts } from "./useSettingsOpenAppDrafts";
import { useSettingsQuickCommandDrafts } from "./useSettingsQuickCommandDrafts";
import { useSettingsShortcutDrafts } from "./useSettingsShortcutDrafts";
import { useSettingsCommonLinksDrafts } from "./useSettingsCommonLinksDrafts";
import { useSettingsCodexSection } from "./useSettingsCodexSection";
import { useSettingsDisplaySection } from "./useSettingsDisplaySection";
import { useSettingsEnvironmentsSection } from "./useSettingsEnvironmentsSection";
import { useSettingsFeaturesSection } from "./useSettingsFeaturesSection";
import { useSettingsGitSection } from "./useSettingsGitSection";
import { useSettingsAgentsSection } from "./useSettingsAgentsSection";
import { useSettingsProjectsSection } from "./useSettingsProjectsSection";
import { useSettingsServerSection } from "./useSettingsServerSection";
import type { GroupedWorkspaces } from "./settingsSectionTypes";
import {
  COMPOSER_PRESET_CONFIGS,
  COMPOSER_PRESET_LABELS,
  DICTATION_MODELS,
} from "@settings/components/settingsViewConstants";

type UseSettingsViewOrchestrationArgs = {
  workspaceGroups: WorkspaceGroup[];
  groupedWorkspaces: GroupedWorkspaces;
  ungroupedLabel: string;
  reduceTransparency: boolean;
  onToggleTransparency: (value: boolean) => void;
  appSettings: AppSettings;
  openAppIconById: Record<string, string>;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onToggleAutomaticAppUpdateChecks?: () => void;
  onRunDoctor: (
    codexBin: string | null,
    codexArgs: string | null,
  ) => Promise<CodexDoctorResult>;
  onRunCodexUpdateCheck?: (
    codexBin: string | null,
    codexArgs: string | null,
  ) => Promise<CodexUpdateCheckResult>;
  onRunCodexUpdate?: (
    codexBin: string | null,
    codexArgs: string | null,
    killActiveSessions?: boolean,
  ) => Promise<CodexUpdateResult>;
  onUpdateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceSettings>,
  ) => Promise<void>;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  onTestNotificationSound: () => void;
  onTestSystemNotification: () => void;
  onMobileConnectSuccess?: () => Promise<void> | void;
  onMoveWorkspace: (id: string, direction: "up" | "down") => void;
  onDeleteWorkspace: (id: string) => void;
  onCreateWorkspaceGroup: (name: string) => Promise<WorkspaceGroup | null>;
  onRenameWorkspaceGroup: (id: string, name: string) => Promise<boolean | null>;
  onMoveWorkspaceGroup: (id: string, direction: "up" | "down") => Promise<boolean | null>;
  onDeleteWorkspaceGroup: (id: string) => Promise<boolean | null>;
  onAssignWorkspaceGroup: (
    workspaceId: string,
    groupId: string | null,
  ) => Promise<boolean | null>;
  dictationModelStatus?: DictationModelStatus | null;
  onDownloadDictationModel?: () => void;
  onCancelDictationDownload?: () => void;
  onRemoveDictationModel?: () => void;
};

export function useSettingsViewOrchestration({
  workspaceGroups,
  groupedWorkspaces,
  ungroupedLabel,
  reduceTransparency,
  onToggleTransparency,
  appSettings,
  openAppIconById,
  onUpdateAppSettings,
  onToggleAutomaticAppUpdateChecks,
  onRunDoctor,
  onRunCodexUpdateCheck,
  onRunCodexUpdate,
  onUpdateWorkspaceSettings,
  scaleShortcutTitle,
  scaleShortcutText,
  onTestNotificationSound,
  onTestSystemNotification,
  onMobileConnectSuccess,
  onMoveWorkspace,
  onDeleteWorkspace,
  onCreateWorkspaceGroup,
  onRenameWorkspaceGroup,
  onMoveWorkspaceGroup,
  onDeleteWorkspaceGroup,
  onAssignWorkspaceGroup,
  dictationModelStatus,
  onDownloadDictationModel,
  onCancelDictationDownload,
  onRemoveDictationModel,
}: UseSettingsViewOrchestrationArgs) {
  const { t } = useTranslation("settings");
  const projects = useMemo(
    () => groupedWorkspaces.flatMap((group) => group.workspaces),
    [groupedWorkspaces],
  );
  const mainWorkspaces = useMemo(
    () => projects.filter((workspace) => (workspace.kind ?? "main") !== "worktree"),
    [projects],
  );
  const featureWorkspaceId = useMemo(
    () => projects.find((workspace) => workspace.connected)?.id ?? null,
    [projects],
  );

  const optionKeyLabel = isMacPlatform()
    ? t("keyboardKeys.option")
    : t("keyboardKeys.alt");
  const metaKeyLabel = isMacPlatform()
    ? t("keyboardKeys.command")
    : isWindowsPlatform()
      ? t("keyboardKeys.windows")
      : t("keyboardKeys.meta");
  const followUpShortcutLabel = isMacPlatform()
    ? `${t("keyboardKeys.shift")}+${t("keyboardKeys.commandShort")}+Enter`
    : `${t("keyboardKeys.shift")}+${t("keyboardKeys.ctrlShort")}+Enter`;

  const selectedDictationModel = useMemo(() => {
    return (
      DICTATION_MODELS.find(
        (model) => model.id === appSettings.dictationModelId,
      ) ?? DICTATION_MODELS[1]
    );
  }, [appSettings.dictationModelId]);

  const dictationReady = dictationModelStatus?.state === "ready";

  const {
    quickCommandDrafts,
    handleQuickCommandDraftChange,
    handleCommitQuickCommandDrafts,
    handleAddQuickCommand,
    handleDeleteQuickCommand,
  } = useSettingsQuickCommandDrafts({
    appSettings,
    onUpdateAppSettings,
  });

  const {
    openAppDrafts,
    openAppSelectedId,
    handleOpenAppDraftChange,
    handleOpenAppKindChange,
    handleCommitOpenAppsDrafts,
    handleMoveOpenApp,
    handleDeleteOpenApp,
    handleAddOpenApp,
    handleSelectOpenAppDefault,
  } = useSettingsOpenAppDrafts({
    appSettings,
    onUpdateAppSettings,
    newAppLabel: t("openApps.newAppLabel"),
  });

  const { shortcutDrafts, handleShortcutKeyDown, clearShortcut } =
    useSettingsShortcutDrafts({
      appSettings,
      onUpdateAppSettings,
    });

  const {
    commonLinkDrafts,
    handleCommonLinkDraftChange,
    handleCommitCommonLinksDrafts,
    handleMoveCommonLink,
    handleDeleteCommonLink,
    handleAddCommonLink,
  } = useSettingsCommonLinksDrafts({
    appSettings,
    onUpdateAppSettings,
    newLinkLabel: t("commonLinks.newLinkLabel"),
  });

  const projectsSectionProps = useSettingsProjectsSection({
    appSettings,
    workspaceGroups,
    groupedWorkspaces,
    ungroupedLabel,
    projects,
    onUpdateAppSettings,
    onMoveWorkspace,
    onDeleteWorkspace,
    onCreateWorkspaceGroup,
    onRenameWorkspaceGroup,
    onMoveWorkspaceGroup,
    onDeleteWorkspaceGroup,
    onAssignWorkspaceGroup,
  });

  const environmentsSectionProps = useSettingsEnvironmentsSection({
    appSettings,
    onUpdateAppSettings,
    mainWorkspaces,
    onUpdateWorkspaceSettings,
  });

  const displaySectionProps = useSettingsDisplaySection({
    appSettings,
    reduceTransparency,
    onToggleTransparency,
    onUpdateAppSettings,
    scaleShortcutTitle,
    scaleShortcutText,
    onTestNotificationSound,
    onTestSystemNotification,
  });

  const serverSectionProps = useSettingsServerSection({
    appSettings,
    onUpdateAppSettings,
    onMobileConnectSuccess,
  });

  const codexSectionProps = useSettingsCodexSection({
    appSettings,
    projects,
    onUpdateAppSettings,
    onRunDoctor,
    onRunCodexUpdateCheck,
    onRunCodexUpdate,
  });

  const gitSectionProps = useSettingsGitSection({
    appSettings,
    onUpdateAppSettings,
    models: codexSectionProps.defaultModels,
  });

  const featuresSectionProps = useSettingsFeaturesSection({
    appSettings,
    featureWorkspaceId,
    onUpdateAppSettings,
  });

  const agentsSectionProps = useSettingsAgentsSection({ projects });

  return {
    aboutSectionProps: {
      appSettings,
      onToggleAutomaticAppUpdateChecks,
    },
    projectsSectionProps,
    environmentsSectionProps,
    displaySectionProps,
    composerSectionProps: {
      appSettings,
      quickCommandDrafts,
      optionKeyLabel,
      followUpShortcutLabel,
      composerPresetLabels: COMPOSER_PRESET_LABELS,
      onComposerPresetChange: (
        preset: AppSettings["composerEditorPreset"],
      ) => {
        const config = COMPOSER_PRESET_CONFIGS[preset];
        void onUpdateAppSettings({
          ...appSettings,
          composerEditorPreset: preset,
          ...config,
        });
      },
      onQuickCommandDraftChange: handleQuickCommandDraftChange,
      onCommitQuickCommands: handleCommitQuickCommandDrafts,
      onAddQuickCommand: handleAddQuickCommand,
      onDeleteQuickCommand: handleDeleteQuickCommand,
      onUpdateAppSettings,
    },
    dictationSectionProps: {
      appSettings,
      optionKeyLabel,
      metaKeyLabel,
      dictationModels: DICTATION_MODELS,
      selectedDictationModel,
      dictationModelStatus,
      dictationReady,
      onUpdateAppSettings,
      onDownloadDictationModel,
      onCancelDictationDownload,
      onRemoveDictationModel,
    },
    shortcutsSectionProps: {
      shortcutDrafts,
      onShortcutKeyDown: handleShortcutKeyDown,
      onClearShortcut: clearShortcut,
    },
    commonLinksSectionProps: {
      commonLinkDrafts,
      onCommonLinkDraftChange: handleCommonLinkDraftChange,
      onCommitCommonLinks: handleCommitCommonLinksDrafts,
      onMoveCommonLink: handleMoveCommonLink,
      onDeleteCommonLink: handleDeleteCommonLink,
      onAddCommonLink: handleAddCommonLink,
    },
    openAppsSectionProps: {
      openAppDrafts,
      openAppSelectedId,
      openAppIconById,
      onOpenAppDraftChange: handleOpenAppDraftChange,
      onOpenAppKindChange: handleOpenAppKindChange,
      onCommitOpenApps: handleCommitOpenAppsDrafts,
      onMoveOpenApp: handleMoveOpenApp,
      onDeleteOpenApp: handleDeleteOpenApp,
      onAddOpenApp: handleAddOpenApp,
      onSelectOpenAppDefault: handleSelectOpenAppDefault,
    },
    gitSectionProps,
    serverSectionProps,
    agentsSectionProps,
    codexSectionProps,
    featuresSectionProps,
  };
}

export type SettingsViewOrchestration = ReturnType<typeof useSettingsViewOrchestration>;
