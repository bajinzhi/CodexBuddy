// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelProviderSettings, WorkspaceInfo } from "../../../types";
import i18n from "@/i18n";
import {
  getConfigModel,
  getModelList,
  getModelProviderSettings,
} from "../../../services/tauri";
import { useModels } from "./useModels";

vi.mock("../../../services/tauri", () => ({
  getModelList: vi.fn(),
  getConfigModel: vi.fn(),
  getModelProviderSettings: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexBuddy",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

function providerSettings(): ModelProviderSettings {
  return {
    activeProviderId: "openai",
    activeModel: null,
    activeSessions: [],
    providers: [
      {
        id: "openai",
        name: "OpenAI",
        baseUrl: null,
        envKey: null,
        wireApi: "responses",
        models: [],
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

describe("useModels", () => {
  beforeEach(() => {
    vi.mocked(getModelProviderSettings).mockResolvedValue(providerSettings());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds the config model when it is missing from model/list", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "remote-1",
            model: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(0));

    expect(getConfigModel).toHaveBeenCalledWith("workspace-1");
    expect(result.current.models[0]).toMatchObject({
      id: "custom-model",
      model: "custom-model",
    });
    expect(result.current.selectedModel?.model).toBe("custom-model");
    expect(result.current.reasoningSupported).toBe(false);
  });

  it("prefers the provider entry when the config model matches by slug", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "provider-id",
            model: "custom-model",
            displayName: "Provider Custom",
            supportedReasoningEfforts: [
              { reasoningEffort: "medium", description: "Medium" },
              { reasoningEffort: "high", description: "High" },
            ],
            defaultReasoningEffort: "medium",
            isDefault: false,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.selectedModelId).toBe("provider-id"));

    expect(result.current.models).toHaveLength(1);
    expect(result.current.selectedModel?.id).toBe("provider-id");
    expect(result.current.reasoningSupported).toBe(true);
  });

  it("adds configured models for the active built-in provider", async () => {
    vi.mocked(getModelProviderSettings).mockResolvedValueOnce({
      ...providerSettings(),
      activeModel: "gpt-local",
      providers: [
        {
          ...providerSettings().providers[0],
          models: ["gpt-local"],
        },
      ],
    });
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: { data: [] },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce(null);

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models[0]?.model).toBe("gpt-local"));

    expect(result.current.models[0]).toMatchObject({
      id: "openai:gpt-local",
      source: "providerCatalog",
      providerId: "openai",
    });
    expect(result.current.selectedModel?.id).toBe("openai:gpt-local");
  });

  it("keeps the configured built-in default when the workspace model list has a superset", async () => {
    vi.mocked(getModelProviderSettings).mockResolvedValueOnce({
      ...providerSettings(),
      activeModel: "gpt-5",
      providers: [
        {
          ...providerSettings().providers[0],
          models: ["gpt-5"],
        },
      ],
    });
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "remote-1",
            model: "gpt-5",
            displayName: "GPT-5",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: false,
          },
          {
            id: "remote-2",
            model: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce(null);

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(0));

    expect(result.current.models.find((model) => model.model === "gpt-5")?.isDefault).toBe(
      true,
    );
    expect(result.current.selectedModel?.model).toBe("gpt-5");
  });

  it("keeps the selected reasoning effort when switching models", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "remote-1",
            model: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [
              { reasoningEffort: "low", description: "Low" },
              { reasoningEffort: "medium", description: "Medium" },
            ],
            defaultReasoningEffort: "medium",
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(1));

    act(() => {
      result.current.setSelectedEffort("high");
      result.current.setSelectedModelId("custom-model");
    });

    await waitFor(() => {
      expect(result.current.selectedModelId).toBe("custom-model");
      expect(result.current.selectedEffort).toBe("high");
    });
  });

  it("re-localizes the synthetic config model without refetching", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "remote-1",
            model: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => {
      expect(
        result.current.models.find((model) => model.model === "custom-model")?.displayName,
      ).toContain("(config)");
    });

    await act(async () => {
      await i18n.changeLanguage("zh-CN");
    });

    await waitFor(() => {
      expect(
        result.current.models.find((model) => model.model === "custom-model")?.displayName,
      ).toContain("（配置）");
    });

    expect(getModelList).toHaveBeenCalledTimes(1);
    expect(getConfigModel).toHaveBeenCalledTimes(1);
  });
});
