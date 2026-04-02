import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import type {
  AppSettings,
  CodexDoctorResult,
  CodexUpdateCheckResult,
  CodexUpdateResult,
  WorkspaceInfo,
} from "@/types";
import { useGlobalAgentsMd } from "./useGlobalAgentsMd";
import { useGlobalCodexConfigToml } from "./useGlobalCodexConfigToml";
import { useSettingsDefaultModels } from "./useSettingsDefaultModels";
import { buildEditorContentMeta } from "@settings/components/settingsViewHelpers";
import { normalizeCodexArgsInput } from "@/utils/codexArgsInput";

type UseSettingsCodexSectionArgs = {
  appSettings: AppSettings;
  projects: WorkspaceInfo[];
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
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
};

export type SettingsCodexSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  defaultModels: ReturnType<typeof useSettingsDefaultModels>["models"];
  defaultModelsLoading: boolean;
  defaultModelsError: string | null;
  defaultModelsConnectedWorkspaceCount: number;
  onRefreshDefaultModels: () => void;
  codexPathDraft: string;
  codexArgsDraft: string;
  codexDirty: boolean;
  isSavingSettings: boolean;
  doctorState: {
    status: "idle" | "running" | "done";
    result: CodexDoctorResult | null;
  };
  codexUpdateState: {
    status: "idle" | "running" | "done";
    result: CodexUpdateResult | null;
  };
  globalAgentsMeta: string;
  globalAgentsError: string | null;
  globalAgentsContent: string;
  globalAgentsLoading: boolean;
  globalAgentsRefreshDisabled: boolean;
  globalAgentsSaveDisabled: boolean;
  globalAgentsSaveLabel: string;
  globalConfigMeta: string;
  globalConfigError: string | null;
  globalConfigContent: string;
  globalConfigLoading: boolean;
  globalConfigRefreshDisabled: boolean;
  globalConfigSaveDisabled: boolean;
  globalConfigSaveLabel: string;
  onSetCodexPathDraft: Dispatch<SetStateAction<string>>;
  onSetCodexArgsDraft: Dispatch<SetStateAction<string>>;
  onSetGlobalAgentsContent: (value: string) => void;
  onSetGlobalConfigContent: (value: string) => void;
  onBrowseCodex: () => Promise<void>;
  onSaveCodexSettings: () => Promise<void>;
  onRunDoctor: () => Promise<void>;
  onRunCodexUpdate: () => Promise<void>;
  onRefreshGlobalAgents: () => void;
  onSaveGlobalAgents: () => void;
  onRefreshGlobalConfig: () => void;
  onSaveGlobalConfig: () => void;
};

export const useSettingsCodexSection = ({
  appSettings,
  projects,
  onUpdateAppSettings,
  onRunDoctor,
  onRunCodexUpdateCheck,
  onRunCodexUpdate,
}: UseSettingsCodexSectionArgs): SettingsCodexSectionProps => {
  const { t } = useTranslation(["settings", "common"]);
  const [codexPathDraft, setCodexPathDraft] = useState(appSettings.codexBin ?? "");
  const [codexArgsDraft, setCodexArgsDraft] = useState(appSettings.codexArgs ?? "");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [doctorState, setDoctorState] = useState<{
    status: "idle" | "running" | "done";
    result: CodexDoctorResult | null;
  }>({ status: "idle", result: null });
  const [codexUpdateState, setCodexUpdateState] = useState<{
    status: "idle" | "running" | "done";
    result: CodexUpdateResult | null;
  }>({ status: "idle", result: null });

  const {
    models: defaultModels,
    isLoading: defaultModelsLoading,
    error: defaultModelsError,
    connectedWorkspaceCount: defaultModelsConnectedWorkspaceCount,
    refresh: refreshDefaultModels,
  } = useSettingsDefaultModels(projects);

  const {
    content: globalAgentsContent,
    exists: globalAgentsExists,
    truncated: globalAgentsTruncated,
    isLoading: globalAgentsLoading,
    isSaving: globalAgentsSaving,
    error: globalAgentsError,
    isDirty: globalAgentsDirty,
    setContent: setGlobalAgentsContent,
    refresh: refreshGlobalAgents,
    save: saveGlobalAgents,
  } = useGlobalAgentsMd();

  const {
    content: globalConfigContent,
    exists: globalConfigExists,
    truncated: globalConfigTruncated,
    isLoading: globalConfigLoading,
    isSaving: globalConfigSaving,
    error: globalConfigError,
    isDirty: globalConfigDirty,
    setContent: setGlobalConfigContent,
    refresh: refreshGlobalConfig,
    save: saveGlobalConfig,
  } = useGlobalCodexConfigToml();

  const globalAgentsEditorMeta = buildEditorContentMeta({
    isLoading: globalAgentsLoading,
    isSaving: globalAgentsSaving,
    exists: globalAgentsExists,
    truncated: globalAgentsTruncated,
    isDirty: globalAgentsDirty,
  });

  const globalConfigEditorMeta = buildEditorContentMeta({
    isLoading: globalConfigLoading,
    isSaving: globalConfigSaving,
    exists: globalConfigExists,
    truncated: globalConfigTruncated,
    isDirty: globalConfigDirty,
  });

  useEffect(() => {
    setCodexPathDraft(appSettings.codexBin ?? "");
  }, [appSettings.codexBin]);

  useEffect(() => {
    setCodexArgsDraft(appSettings.codexArgs ?? "");
  }, [appSettings.codexArgs]);

  const nextCodexBin = codexPathDraft.trim() ? codexPathDraft.trim() : null;
  const nextCodexArgs = normalizeCodexArgsInput(codexArgsDraft);
  const codexDirty =
    nextCodexBin !== (appSettings.codexBin ?? null) ||
    nextCodexArgs !== (appSettings.codexArgs ?? null);

  const handleBrowseCodex = async () => {
    const selection = await open({ multiple: false, directory: false });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    setCodexPathDraft(selection);
  };

  const handleSaveCodexSettings = async () => {
    setIsSavingSettings(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        codexBin: nextCodexBin,
        codexArgs: nextCodexArgs,
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleRunDoctor = async () => {
    setDoctorState({ status: "running", result: null });
    try {
      const result = await onRunDoctor(nextCodexBin, nextCodexArgs);
      setDoctorState({ status: "done", result });
    } catch (error) {
      setDoctorState({
        status: "done",
        result: {
          ok: false,
          codexBin: nextCodexBin,
          version: null,
          appServerOk: false,
          details: error instanceof Error ? error.message : String(error),
          path: null,
          nodeOk: false,
          nodeVersion: null,
          nodeDetails: null,
        },
      });
    }
  };

  const handleRunCodexUpdate = async () => {
    setCodexUpdateState({ status: "running", result: null });
    try {
      if (!onRunCodexUpdate || !onRunCodexUpdateCheck) {
        setCodexUpdateState({
          status: "done",
          result: {
            ok: false,
            method: "unknown",
            package: null,
            beforeVersion: null,
            afterVersion: null,
            upgraded: false,
            output: null,
            details: "Codex updates are not available in this build.",
          },
        });
        return;
      }

      const check = await onRunCodexUpdateCheck(nextCodexBin, nextCodexArgs);
      if (!check.canUpdate) {
        setCodexUpdateState({
          status: "done",
          result: {
            ok: false,
            method: check.method,
            package: check.package,
            beforeVersion: check.beforeVersion,
            afterVersion: null,
            upgraded: false,
            output: null,
            details:
              check.details ?? "Codex updates are not available in this build.",
          },
        });
        return;
      }

      if (check.upToDate) {
        setCodexUpdateState({
          status: "done",
          result: {
            ok: true,
            method: check.method,
            package: check.package,
            beforeVersion: check.beforeVersion,
            afterVersion: check.beforeVersion,
            upgraded: false,
            output: null,
            details: t("codex.alreadyLatestDetails", { ns: "settings" }),
          },
        });
        return;
      }

      let killActiveSessions = false;
      if (check.activeSessionCount > 0) {
        const activeNames = check.activeSessions
          .slice(0, 5)
          .map((session) => `- ${session.workspaceName}`);
        const promptLines = [
          t("codex.updateSessionsInUsePrompt", {
            ns: "settings",
            count: check.activeSessionCount,
          }),
          ...activeNames,
          check.activeSessionCount > activeNames.length
            ? t("codex.updateSessionsInUseMore", {
                ns: "settings",
                count: check.activeSessionCount - activeNames.length,
              })
            : null,
          t("codex.updateSessionsInUseWarning", { ns: "settings" }),
        ].filter((line): line is string => Boolean(line));

        const confirmed = await ask(promptLines.join("\n"), {
          title: t("codex.updateSessionsInUseTitle", { ns: "settings" }),
          kind: "warning",
          okLabel: t("codex.killSessionsAndUpdate", { ns: "settings" }),
          cancelLabel: t("actions.cancel", { ns: "common" }),
        });
        if (!confirmed) {
          setCodexUpdateState({ status: "idle", result: null });
          return;
        }
        killActiveSessions = true;
      }

      const result = await onRunCodexUpdate(
        nextCodexBin,
        nextCodexArgs,
        killActiveSessions,
      );
      setCodexUpdateState({ status: "done", result });
    } catch (error) {
      setCodexUpdateState({
        status: "done",
        result: {
          ok: false,
          method: "unknown",
          package: null,
          beforeVersion: null,
          afterVersion: null,
          upgraded: false,
          output: null,
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  return {
    appSettings,
    onUpdateAppSettings,
    defaultModels,
    defaultModelsLoading,
    defaultModelsError,
    defaultModelsConnectedWorkspaceCount,
    onRefreshDefaultModels: () => {
      void refreshDefaultModels();
    },
    codexPathDraft,
    codexArgsDraft,
    codexDirty,
    isSavingSettings,
    doctorState,
    codexUpdateState,
    globalAgentsMeta: globalAgentsEditorMeta.meta,
    globalAgentsError,
    globalAgentsContent,
    globalAgentsLoading,
    globalAgentsRefreshDisabled: globalAgentsEditorMeta.refreshDisabled,
    globalAgentsSaveDisabled: globalAgentsEditorMeta.saveDisabled,
    globalAgentsSaveLabel: globalAgentsEditorMeta.saveLabel,
    globalConfigMeta: globalConfigEditorMeta.meta,
    globalConfigError,
    globalConfigContent,
    globalConfigLoading,
    globalConfigRefreshDisabled: globalConfigEditorMeta.refreshDisabled,
    globalConfigSaveDisabled: globalConfigEditorMeta.saveDisabled,
    globalConfigSaveLabel: globalConfigEditorMeta.saveLabel,
    onSetCodexPathDraft: setCodexPathDraft,
    onSetCodexArgsDraft: setCodexArgsDraft,
    onSetGlobalAgentsContent: setGlobalAgentsContent,
    onSetGlobalConfigContent: setGlobalConfigContent,
    onBrowseCodex: handleBrowseCodex,
    onSaveCodexSettings: handleSaveCodexSettings,
    onRunDoctor: handleRunDoctor,
    onRunCodexUpdate: handleRunCodexUpdate,
    onRefreshGlobalAgents: () => {
      void refreshGlobalAgents();
    },
    onSaveGlobalAgents: () => {
      void saveGlobalAgents();
    },
    onRefreshGlobalConfig: () => {
      void refreshGlobalConfig();
    },
    onSaveGlobalConfig: () => {
      void saveGlobalConfig();
    },
  };
};
