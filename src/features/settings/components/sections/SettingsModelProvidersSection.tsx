import { useEffect, useMemo, useState } from "react";
import Eye from "lucide-react/dist/esm/icons/eye";
import EyeOff from "lucide-react/dist/esm/icons/eye-off";
import { ask } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import type {
  ModelProviderConfig,
  ModelProviderKeyValue,
  ModelProviderSettings,
} from "@/types";
import {
  getModelProviderSettings,
  saveModelProviderSettings,
} from "@services/tauri";

type SettingsModelProvidersSectionProps = {
  onSaved?: () => void;
};

const DEFAULT_WIRE_API = "responses";

function makeProviderId(existing: ModelProviderConfig[]): string {
  const base = "custom-provider";
  const taken = new Set(existing.map((provider) => provider.id.toLowerCase()));
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function createProvider(existing: ModelProviderConfig[]): ModelProviderConfig {
  const id = makeProviderId(existing);
  return {
    id,
    name: "Custom Provider",
    baseUrl: "https://api.example.com/v1",
    envKey: null,
    wireApi: DEFAULT_WIRE_API,
    models: ["custom-model"],
    apiKey: null,
    queryParams: [],
    httpHeaders: [],
    envHttpHeaders: [],
    requestMaxRetries: null,
    streamMaxRetries: null,
    streamIdleTimeoutMs: null,
    isBuiltin: false,
    isReserved: false,
  };
}

function formatModels(models: string[]): string {
  return models.join("\n");
}

function parseModels(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((model) => model.trim())
    .filter(Boolean);
}

function formatKeyValues(values: ModelProviderKeyValue[]): string {
  return values.map((entry) => `${entry.key}=${entry.value}`).join("\n");
}

function parseKeyValues(value: string): ModelProviderKeyValue[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 0) {
        return { key: line, value: "" };
      }
      return {
        key: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim(),
      };
    });
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function replaceProvider(
  settings: ModelProviderSettings,
  provider: ModelProviderConfig,
  previousId: string,
): ModelProviderSettings {
  return {
    ...settings,
    providers: settings.providers.map((candidate) =>
      candidate.id === previousId ? provider : candidate,
    ),
  };
}

export function SettingsModelProvidersSection({
  onSaved,
}: SettingsModelProvidersSectionProps) {
  const { t } = useTranslation(["settings", "common"]);
  const [settings, setSettings] = useState<ModelProviderSettings | null>(null);
  const [draft, setDraft] = useState<ModelProviderSettings | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("openai");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const selectedProvider = useMemo(
    () =>
      draft?.providers.find((provider) => provider.id === selectedProviderId) ??
      draft?.providers[0] ??
      null,
    [draft, selectedProviderId],
  );

  const reload = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await getModelProviderSettings();
      setSettings(next);
      setDraft(next);
      setSelectedProviderId(next.activeProviderId ?? next.providers[0]?.id ?? "openai");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const updateSelectedProvider = (patch: Partial<ModelProviderConfig>) => {
    if (!draft || !selectedProvider) {
      return;
    }
    const nextProvider = {
      ...selectedProvider,
      ...patch,
      id: selectedProvider.isReserved ? selectedProvider.id : patch.id ?? selectedProvider.id,
      isBuiltin: selectedProvider.isBuiltin,
      isReserved: selectedProvider.isReserved,
    };
    const nextDraft = replaceProvider(draft, nextProvider, selectedProviderId);
    setDraft({
      ...nextDraft,
      activeProviderId:
        draft.activeProviderId === selectedProviderId
          ? nextProvider.id
          : nextDraft.activeProviderId,
    });
    if (patch.id && patch.id !== selectedProviderId) {
      setSelectedProviderId(patch.id);
    }
  };

  const addProvider = () => {
    if (!draft) {
      return;
    }
    const provider = createProvider(draft.providers);
    setDraft({
      ...draft,
      providers: [...draft.providers, provider],
      activeProviderId: provider.id,
      activeModel: provider.models[0] ?? draft.activeModel,
    });
    setSelectedProviderId(provider.id);
  };

  const deleteProvider = () => {
    if (!draft || !selectedProvider || selectedProvider.isReserved) {
      return;
    }
    const nextProviders = draft.providers.filter(
      (provider) => provider.id !== selectedProvider.id,
    );
    const nextActive =
      draft.activeProviderId === selectedProvider.id ? "openai" : draft.activeProviderId;
    setDraft({
      ...draft,
      providers: nextProviders,
      activeProviderId: nextActive,
      activeModel: nextActive === "openai" ? null : draft.activeModel,
    });
    setSelectedProviderId(nextActive ?? nextProviders[0]?.id ?? "openai");
  };

  const save = async () => {
    if (!draft) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      let restartActiveSessions = false;
      if ((settings?.activeSessions.length ?? 0) > 0) {
        const confirmed = await ask(
          t("codex.providers.restartPrompt", {
            count: settings?.activeSessions.length ?? 0,
          }),
          {
            title: t("codex.providers.restartTitle"),
            kind: "warning",
            okLabel: t("codex.providers.restartNow"),
            cancelLabel: t("codex.providers.saveWithoutRestart"),
          },
        );
        restartActiveSessions = Boolean(confirmed);
      }
      const saved = await saveModelProviderSettings({
        activeProviderId: draft.activeProviderId,
        activeModel: draft.activeModel,
        providers: draft.providers,
        restartActiveSessions,
      });
      const nextSelectedProviderId = saved.providers.some(
        (provider) => provider.id === selectedProviderId,
      )
        ? selectedProviderId
        : saved.activeProviderId ?? saved.providers[0]?.id ?? "openai";
      setSettings(saved);
      setDraft(saved);
      setSelectedProviderId(nextSelectedProviderId);
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const modelListId = "model-provider-default-models";
  const canEdit = Boolean(selectedProvider);
  const canEditIdentity = Boolean(selectedProvider && !selectedProvider.isReserved);
  const canDelete = Boolean(selectedProvider && !selectedProvider.isReserved);
  const customModels = selectedProvider?.models ?? [];

  return (
    <div className="settings-field settings-model-providers">
      <div className="settings-agents-header">
        <div>
          <div className="settings-field-label">{t("codex.providers.title")}</div>
          <div className="settings-help">{t("codex.providers.subtitle")}</div>
        </div>
        <div className="settings-agents-actions">
          <button type="button" className="ghost" onClick={() => void reload()} disabled={isLoading}>
            {isLoading ? t("common:status.loading") : t("common:actions.refresh")}
          </button>
          <button type="button" className="ghost" onClick={addProvider} disabled={!draft}>
            {t("codex.providers.add")}
          </button>
        </div>
      </div>

      {error && <div className="settings-agents-error">{error}</div>}

      {draft && selectedProvider && (
        <>
          <div className="settings-field-row settings-model-provider-row">
            <select
              className="settings-select"
              value={selectedProviderId}
              onChange={(event) => setSelectedProviderId(event.target.value)}
              aria-label={t("codex.providers.providerAria")}
            >
              {draft.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.id})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ghost"
              disabled={draft.activeProviderId === selectedProvider.id}
              onClick={() =>
                setDraft({
                  ...draft,
                  activeProviderId: selectedProvider.id,
                  activeModel: selectedProvider.models[0] ?? null,
                })
              }
            >
              {draft.activeProviderId === selectedProvider.id
                ? t("codex.providers.active")
                : t("codex.providers.use")}
            </button>
            <button
              type="button"
              className="ghost settings-model-provider-danger"
              disabled={!canDelete}
              onClick={deleteProvider}
            >
              {t("common:actions.delete")}
            </button>
          </div>

          {selectedProvider.isReserved && (
            <div className="settings-help">{t("codex.providers.reservedHelp")}</div>
          )}

          <div className="settings-model-provider-grid">
            <label className="settings-model-provider-field">
              <span className="settings-field-label">{t("codex.providers.id")}</span>
              <input
                className="settings-input"
                value={selectedProvider.id}
                disabled={!canEditIdentity}
                onChange={(event) => updateSelectedProvider({ id: event.target.value })}
              />
            </label>
            <label className="settings-model-provider-field">
              <span className="settings-field-label">{t("codex.providers.name")}</span>
              <input
                className="settings-input"
                value={selectedProvider.name}
                disabled={!canEdit}
                onChange={(event) => updateSelectedProvider({ name: event.target.value })}
              />
            </label>
            <label className="settings-model-provider-field settings-model-provider-field--wide">
              <span className="settings-field-label">{t("codex.providers.baseUrl")}</span>
              <input
                className="settings-input"
                value={selectedProvider.baseUrl ?? ""}
                disabled={!canEdit}
                placeholder="https://api.example.com/v1"
                onChange={(event) =>
                  updateSelectedProvider({ baseUrl: event.target.value || null })
                }
              />
            </label>
            <div className="settings-model-provider-field settings-model-provider-field--wide">
              <label className="settings-field-label" htmlFor="model-provider-api-key">
                {t("codex.providers.apiKey")}
              </label>
              <div className="settings-field-row">
                <input
                  id="model-provider-api-key"
                  className="settings-input"
                  type={showApiKey ? "text" : "password"}
                  value={selectedProvider.apiKey ?? ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateSelectedProvider({ apiKey: event.target.value || null })
                  }
                />
                <button
                  type="button"
                  className="ghost settings-icon-button"
                  onClick={() => setShowApiKey((value) => !value)}
                  aria-label={
                    showApiKey
                      ? t("codex.providers.hideKey")
                      : t("codex.providers.showKey")
                  }
                  title={
                    showApiKey
                      ? t("codex.providers.hideKey")
                      : t("codex.providers.showKey")
                  }
                >
                  {showApiKey ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </button>
              </div>
              <span className="settings-help settings-help-error">
                {t("codex.providers.plaintextWarning")}
              </span>
            </div>
            <label className="settings-model-provider-field settings-model-provider-field--wide">
              <span className="settings-field-label">{t("codex.providers.models")}</span>
              <textarea
                className="settings-agents-textarea settings-agents-textarea--compact"
                value={formatModels(customModels)}
                disabled={!canEdit}
                onChange={(event) =>
                  updateSelectedProvider({ models: parseModels(event.target.value) })
                }
              />
            </label>
            <label className="settings-model-provider-field settings-model-provider-field--wide">
              <span className="settings-field-label">{t("codex.providers.defaultModel")}</span>
              <input
                className="settings-input"
                list={modelListId}
                value={draft.activeModel ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, activeModel: event.target.value || null })
                }
              />
              <datalist id={modelListId}>
                {customModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>
          </div>

          <details className="settings-model-provider-advanced">
            <summary>{t("codex.providers.advanced")}</summary>
            <div className="settings-model-provider-grid">
              <label className="settings-model-provider-field">
                <span className="settings-field-label">{t("codex.providers.requestRetries")}</span>
                <input
                  className="settings-input"
                  type="number"
                  min="0"
                  step="1"
                  value={selectedProvider.requestMaxRetries ?? ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateSelectedProvider({
                      requestMaxRetries: parseOptionalNumber(event.target.value),
                    })
                  }
                />
              </label>
              <label className="settings-model-provider-field">
                <span className="settings-field-label">{t("codex.providers.streamRetries")}</span>
                <input
                  className="settings-input"
                  type="number"
                  min="0"
                  step="1"
                  value={selectedProvider.streamMaxRetries ?? ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateSelectedProvider({
                      streamMaxRetries: parseOptionalNumber(event.target.value),
                    })
                  }
                />
              </label>
              <label className="settings-model-provider-field">
                <span className="settings-field-label">{t("codex.providers.streamTimeout")}</span>
                <input
                  className="settings-input"
                  type="number"
                  min="0"
                  step="1"
                  value={selectedProvider.streamIdleTimeoutMs ?? ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateSelectedProvider({
                      streamIdleTimeoutMs: parseOptionalNumber(event.target.value),
                    })
                  }
                />
              </label>
              <label className="settings-model-provider-field settings-model-provider-field--wide">
                <span className="settings-field-label">{t("codex.providers.queryParams")}</span>
                <textarea
                  className="settings-agents-textarea settings-agents-textarea--compact"
                  value={formatKeyValues(selectedProvider.queryParams)}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateSelectedProvider({
                      queryParams: parseKeyValues(event.target.value),
                    })
                  }
                />
              </label>
              <label className="settings-model-provider-field settings-model-provider-field--wide">
                <span className="settings-field-label">{t("codex.providers.httpHeaders")}</span>
                <textarea
                  className="settings-agents-textarea settings-agents-textarea--compact"
                  value={formatKeyValues(selectedProvider.httpHeaders)}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateSelectedProvider({
                      httpHeaders: parseKeyValues(event.target.value),
                    })
                  }
                />
              </label>
              <label className="settings-model-provider-field settings-model-provider-field--wide">
                <span className="settings-field-label">{t("codex.providers.envHttpHeaders")}</span>
                <textarea
                  className="settings-agents-textarea settings-agents-textarea--compact"
                  value={formatKeyValues(selectedProvider.envHttpHeaders)}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateSelectedProvider({
                      envHttpHeaders: parseKeyValues(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          </details>

          <div className="settings-agents-actions">
            <button type="button" className="primary" onClick={() => void save()} disabled={isSaving}>
              {isSaving ? t("common:status.saving") : t("common:actions.save")}
            </button>
            <div className="settings-help">
              {t("codex.providers.envKeyPreview", {
                envKey: selectedProvider.envKey ?? t("codex.providers.generatedEnvKey"),
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
