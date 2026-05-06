import type { ModelOption, ModelProviderConfig, ModelProviderSettings } from "@/types";

export function getActiveModelProvider(
  settings: ModelProviderSettings | null,
): ModelProviderConfig | null {
  if (!settings) {
    return null;
  }
  const activeId = settings.activeProviderId?.trim() || "openai";
  return settings.providers.find((provider) => provider.id === activeId) ?? null;
}

export function buildProviderCatalogModelOptions(
  settings: ModelProviderSettings | null,
): ModelOption[] {
  const provider = getActiveModelProvider(settings);
  if (!provider || provider.isBuiltin) {
    return [];
  }
  const seen = new Set<string>();
  return provider.models
    .map((model) => model.trim())
    .filter((model) => model.length > 0)
    .filter((model) => {
      const key = model.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((model) => ({
      id: `${provider.id}:${model}`,
      model,
      displayName: `${model} (${provider.name})`,
      description: provider.baseUrl ?? provider.name,
      supportedReasoningEfforts: [],
      defaultReasoningEffort: null,
      isDefault: settings?.activeModel === model,
      providerId: provider.id,
      providerName: provider.name,
      source: "providerCatalog" as const,
    }));
}

export function mergeProviderCatalogModels(
  appServerModels: ModelOption[],
  settings: ModelProviderSettings | null,
): ModelOption[] {
  const providerModels = buildProviderCatalogModelOptions(settings);
  if (providerModels.length === 0) {
    return appServerModels;
  }
  const seen = new Set(providerModels.map((model) => model.model.toLowerCase()));
  return [
    ...providerModels,
    ...appServerModels.filter((model) => !seen.has(model.model.toLowerCase())),
  ];
}
