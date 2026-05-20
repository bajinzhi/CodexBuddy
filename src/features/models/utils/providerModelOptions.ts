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
  if (!provider) {
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
  const mergedModels = appServerModels.map((model) => ({ ...model }));
  const indexBySlug = new Map<string, number>();

  mergedModels.forEach((model, index) => {
    const key = model.model.toLowerCase();
    if (!indexBySlug.has(key)) {
      indexBySlug.set(key, index);
    }
  });

  for (const providerModel of providerModels) {
    const key = providerModel.model.toLowerCase();
    const existingIndex = indexBySlug.get(key);
    if (existingIndex === undefined) {
      indexBySlug.set(key, mergedModels.length);
      mergedModels.push(providerModel);
      continue;
    }

    if (providerModel.isDefault && !mergedModels[existingIndex].isDefault) {
      mergedModels[existingIndex] = {
        ...mergedModels[existingIndex],
        isDefault: true,
      };
    }
  }

  return mergedModels;
}
