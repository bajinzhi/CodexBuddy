import type { ModelOption } from "@/types";

type ConfigModelLabels = {
  displayName?: string;
  description?: string;
};

export function hasConfigModelOption(
  models: ModelOption[],
  configModel: string | null,
): boolean {
  if (!configModel) {
    return false;
  }

  return models.some(
    (model) => model.model === configModel || model.id === configModel,
  );
}

export function buildSyntheticConfigModelOption(
  configModel: string,
  labels: ConfigModelLabels = {},
): ModelOption {
  return {
    id: configModel,
    model: configModel,
    displayName: labels.displayName ?? configModel,
    description: labels.description ?? "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: false,
  };
}

export function prependSyntheticConfigModelOption(
  models: ModelOption[],
  configModel: string | null,
  labels: ConfigModelLabels = {},
): ModelOption[] {
  if (!configModel || hasConfigModelOption(models, configModel)) {
    return models;
  }

  return [buildSyntheticConfigModelOption(configModel, labels), ...models];
}
