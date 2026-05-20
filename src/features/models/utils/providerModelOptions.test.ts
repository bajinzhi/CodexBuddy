import { describe, expect, it } from "vitest";
import type { ModelOption, ModelProviderSettings } from "@/types";
import { mergeProviderCatalogModels } from "./providerModelOptions";

function providerSettings(): ModelProviderSettings {
  return {
    activeProviderId: "openai",
    activeModel: "gpt-5",
    activeSessions: [],
    providers: [
      {
        id: "openai",
        name: "OpenAI",
        baseUrl: null,
        envKey: null,
        wireApi: "responses",
        models: ["gpt-5", "gpt-4.1"],
        apiKey: null,
        queryParams: [],
        httpHeaders: [],
        envHttpHeaders: [],
        requestMaxRetries: null,
        streamMaxRetries: null,
        streamIdleTimeoutMs: null,
        isBuiltin: true,
        isReserved: true,
      },
    ],
  };
}

function appServerModels(): ModelOption[] {
  return [
    {
      id: "remote-1",
      model: "gpt-5",
      displayName: "GPT-5",
      description: "from app-server",
      supportedReasoningEfforts: [
        { reasoningEffort: "medium", description: "App metadata" },
      ],
      defaultReasoningEffort: "medium",
      isDefault: false,
      source: "appServer",
    },
  ];
}

describe("providerModelOptions", () => {
  it("keeps app-server metadata and restores the catalog default flag for duplicate slugs", () => {
    const merged = mergeProviderCatalogModels(appServerModels(), providerSettings());

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      id: "remote-1",
      model: "gpt-5",
      displayName: "GPT-5",
      description: "from app-server",
      supportedReasoningEfforts: [
        { reasoningEffort: "medium", description: "App metadata" },
      ],
      defaultReasoningEffort: "medium",
      isDefault: true,
      source: "appServer",
    });
    expect(merged[1]).toMatchObject({
      id: "openai:gpt-4.1",
      model: "gpt-4.1",
      source: "providerCatalog",
      providerId: "openai",
      providerName: "OpenAI",
    });
  });
});
