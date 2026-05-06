// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ask } from "@tauri-apps/plugin-dialog";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelProviderSettings } from "@/types";
import {
  getModelProviderSettings,
  saveModelProviderSettings,
} from "@services/tauri";
import { SettingsModelProvidersSection } from "./SettingsModelProvidersSection";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
}));

vi.mock("@services/tauri", () => ({
  getModelProviderSettings: vi.fn(),
  saveModelProviderSettings: vi.fn(),
}));

const getModelProviderSettingsMock = vi.mocked(getModelProviderSettings);
const saveModelProviderSettingsMock = vi.mocked(saveModelProviderSettings);
const askMock = vi.mocked(ask);

function settings(activeSessions = 0): ModelProviderSettings {
  return {
    activeProviderId: "acme",
    activeModel: "acme-large",
    activeSessions: Array.from({ length: activeSessions }, (_, index) => ({
      workspaceId: `w${index + 1}`,
      workspaceName: `Workspace ${index + 1}`,
    })),
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
      {
        id: "acme",
        name: "Acme",
        baseUrl: "https://acme.example.com/v1",
        envKey: "CODEXBUDDY_PROVIDER_ACME_API_KEY",
        wireApi: "responses",
        models: ["acme-large"],
        apiKey: "old-key",
        queryParams: [],
        httpHeaders: [],
        envHttpHeaders: [],
        requestMaxRetries: null,
        streamMaxRetries: null,
        streamIdleTimeoutMs: null,
        isBuiltin: false,
        isReserved: false,
      },
    ],
  };
}

describe("SettingsModelProvidersSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("saves plaintext API keys for custom providers", async () => {
    getModelProviderSettingsMock.mockResolvedValueOnce(settings());
    saveModelProviderSettingsMock.mockImplementation(async (input) => ({
      ...settings(),
      activeProviderId: input.activeProviderId,
      activeModel: input.activeModel,
      providers: input.providers,
    }));

    render(<SettingsModelProvidersSection />);

    const apiKeyInput = await screen.findByLabelText("API key");
    fireEvent.change(apiKeyInput, { target: { value: "new-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveModelProviderSettingsMock).toHaveBeenCalled();
    });
    const input = saveModelProviderSettingsMock.mock.calls[0]?.[0];
    expect(input?.restartActiveSessions).toBe(false);
    expect(input?.providers.find((provider) => provider.id === "acme")?.apiKey).toBe(
      "new-key",
    );
  });

  it("can restart active sessions when saving provider changes", async () => {
    getModelProviderSettingsMock.mockResolvedValueOnce(settings(1));
    askMock.mockResolvedValueOnce(true);
    saveModelProviderSettingsMock.mockImplementation(async (input) => ({
      ...settings(),
      activeProviderId: input.activeProviderId,
      activeModel: input.activeModel,
      providers: input.providers,
      activeSessions: [],
    }));

    render(<SettingsModelProvidersSection />);

    await screen.findByDisplayValue("old-key");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveModelProviderSettingsMock).toHaveBeenCalled();
    });
    expect(askMock).toHaveBeenCalled();
    expect(saveModelProviderSettingsMock.mock.calls[0]?.[0].restartActiveSessions).toBe(
      true,
    );
  });

  it("clears stale custom models when switching to a built-in provider", async () => {
    getModelProviderSettingsMock.mockResolvedValueOnce(settings());
    saveModelProviderSettingsMock.mockImplementation(async (input) => ({
      ...settings(),
      activeProviderId: input.activeProviderId,
      activeModel: input.activeModel,
      providers: input.providers,
    }));

    render(<SettingsModelProvidersSection />);

    await screen.findByDisplayValue("old-key");
    fireEvent.change(screen.getByLabelText("Model provider"), {
      target: { value: "openai" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use as default" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveModelProviderSettingsMock).toHaveBeenCalled();
    });
    const input = saveModelProviderSettingsMock.mock.calls[0]?.[0];
    expect(input?.activeProviderId).toBe("openai");
    expect(input?.activeModel).toBeNull();
  });
});
