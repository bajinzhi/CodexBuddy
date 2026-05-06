import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelOption, WorkspaceInfo } from "@/types";
import {
  connectWorkspace,
  getConfigModel,
  getModelList,
  getModelProviderSettings,
} from "@services/tauri";
import { parseModelListResponse } from "@/features/models/utils/modelListResponse";
import { prependSyntheticConfigModelOption } from "@/features/models/utils/configModelOptions";
import {
  buildProviderCatalogModelOptions,
  mergeProviderCatalogModels,
} from "@/features/models/utils/providerModelOptions";

type SettingsDefaultModelsState = {
  rawModels: ModelOption[];
  configModel: string | null;
  isLoading: boolean;
  error: string | null;
  connectedWorkspaceCount: number;
};

const EMPTY_STATE: SettingsDefaultModelsState = {
  rawModels: [],
  configModel: null,
  isLoading: false,
  error: null,
  connectedWorkspaceCount: 0,
};

const parseGptVersionScore = (slug: string): number | null => {
  const match = /^gpt-(\d+)(?:\.(\d+))?(?:\.(\d+))?/i.exec(slug.trim());
  if (!match) {
    return null;
  }
  const major = Number(match[1] ?? NaN);
  const minor = Number(match[2] ?? 0);
  const patch = Number(match[3] ?? 0);
  if (!Number.isFinite(major)) {
    return null;
  }
  return major * 1_000_000 + minor * 1_000 + patch;
};

const gptVariantPenalty = (slug: string): number => {
  const match = /^gpt-(\d+(?:\.\d+){0,2})(.*)$/i.exec(slug.trim());
  if (!match) {
    return 1;
  }
  const suffix = match[2] ?? "";
  return suffix.startsWith("-") ? 1 : 0;
};

function compareModelsByLatest(a: ModelOption, b: ModelOption): number {
  const scoreA = parseGptVersionScore(a.model) ?? -1;
  const scoreB = parseGptVersionScore(b.model) ?? -1;
  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }
  const penaltyA = gptVariantPenalty(a.model);
  const penaltyB = gptVariantPenalty(b.model);
  if (penaltyA !== penaltyB) {
    return penaltyA - penaltyB;
  }
  if (a.isDefault !== b.isDefault) {
    return a.isDefault ? -1 : 1;
  }
  return a.model.localeCompare(b.model);
}

export function useSettingsDefaultModels(projects: WorkspaceInfo[]) {
  const { t } = useTranslation("settings");
  const [state, setState] = useState<SettingsDefaultModelsState>(EMPTY_STATE);
  const requestIdRef = useRef(0);
  const sourceWorkspaceId = projects[0]?.id ?? null;
  const sourceWorkspaceName = projects[0]?.name ?? null;
  const sourceWorkspaceConnected = projects[0]?.connected ?? false;

  const models = useMemo(
    () =>
      prependSyntheticConfigModelOption(state.rawModels, state.configModel, {
        displayName: state.configModel
          ? t("codex.configModelDisplayName", { configModel: state.configModel })
          : undefined,
        description: t("codex.configModelDescription"),
      }).slice().sort(compareModelsByLatest),
    [state.configModel, state.rawModels, t],
  );

  const refresh = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (!sourceWorkspaceId || !sourceWorkspaceName) {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const providerSettings = await getModelProviderSettings();
        if (requestId !== requestIdRef.current) {
          return;
        }
        setState({
          rawModels: buildProviderCatalogModelOptions(providerSettings),
          configModel: providerSettings.activeModel,
          isLoading: false,
          error: null,
          connectedWorkspaceCount: 0,
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setState({
          ...EMPTY_STATE,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      connectedWorkspaceCount: 1,
    }));

    try {
      const errors: string[] = [];
      let canReadModelList = sourceWorkspaceConnected;
      if (!canReadModelList) {
        try {
          await connectWorkspace(sourceWorkspaceId);
          canReadModelList = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${sourceWorkspaceName}: ${message}`);
        }
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      const [modelListResult, configModelResult, providerSettingsResult] =
        await Promise.allSettled([
          canReadModelList ? getModelList(sourceWorkspaceId) : Promise.resolve(null),
          getConfigModel(sourceWorkspaceId),
          getModelProviderSettings(),
        ]);
      if (requestId !== requestIdRef.current) {
        return;
      }

      if (modelListResult.status === "rejected") {
        const message =
          modelListResult.reason instanceof Error
            ? modelListResult.reason.message
            : String(modelListResult.reason);
        errors.push(`${sourceWorkspaceName}: ${message}`);
      }
      if (configModelResult.status === "rejected") {
        const message =
          configModelResult.reason instanceof Error
            ? configModelResult.reason.message
            : String(configModelResult.reason);
        errors.push(`${sourceWorkspaceName}: ${message}`);
      }
      if (providerSettingsResult.status === "rejected") {
        const message =
          providerSettingsResult.reason instanceof Error
            ? providerSettingsResult.reason.message
            : String(providerSettingsResult.reason);
        errors.push(message);
      }

      const modelsFromList = parseModelListResponse(
        modelListResult.status === "fulfilled" ? modelListResult.value : null,
      );
      const providerSettings =
        providerSettingsResult.status === "fulfilled"
          ? providerSettingsResult.value
          : null;
      const configModel =
        configModelResult.status === "fulfilled"
          ? configModelResult.value
          : providerSettings?.activeModel ?? null;
      setState({
        rawModels: mergeProviderCatalogModels(modelsFromList, providerSettings),
        configModel,
        isLoading: false,
        error: errors.length ? errors.join(" | ") : null,
        connectedWorkspaceCount: 1,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (requestId === requestIdRef.current) {
        setState({
          rawModels: [],
          configModel: null,
          isLoading: false,
          error: message,
          connectedWorkspaceCount: sourceWorkspaceId ? 1 : 0,
        });
      }
    }
  }, [sourceWorkspaceConnected, sourceWorkspaceId, sourceWorkspaceName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    models,
    isLoading: state.isLoading,
    error: state.error,
    connectedWorkspaceCount: state.connectedWorkspaceCount,
    refresh,
  };
}
