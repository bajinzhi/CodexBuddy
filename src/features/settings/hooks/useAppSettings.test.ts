// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, CodexDoctorResult } from "@/types";
import { UI_LANGUAGE_STORAGE_KEY } from "@/i18n/preferences";
import { useAppSettings } from "./useAppSettings";
import {
  getAppSettings,
  runCodexDoctor,
  updateAppSettings,
} from "@services/tauri";
import { UI_SCALE_DEFAULT, UI_SCALE_MAX } from "@utils/uiScale";

vi.mock("@services/tauri", () => ({
  getAppSettings: vi.fn(),
  updateAppSettings: vi.fn(),
  runCodexDoctor: vi.fn(),
}));

const getAppSettingsMock = vi.mocked(getAppSettings);
const updateAppSettingsMock = vi.mocked(updateAppSettings);
const runCodexDoctorMock = vi.mocked(runCodexDoctor);

describe("useAppSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads settings and normalizes theme + uiScale", async () => {
    getAppSettingsMock.mockResolvedValue(
      ({
        uiScale: UI_SCALE_MAX + 1,
        theme: "nope" as unknown as AppSettings["theme"],
        uiLanguage: "invalid" as unknown as AppSettings["uiLanguage"],
        backendMode: "remote",
        remoteBackendHost: "example:1234",
        personality: "unknown",
        uiFontFamily: "",
        codeFontFamily: "  ",
        codeFontSize: 25,
        quickCommands: [
          { id: "", label: "  Quick fix  ", text: "Explain the bug\nand propose a patch." },
          { id: "", label: 3, text: null },
        ],
      } as unknown) as AppSettings,
    );

    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.uiScale).toBe(UI_SCALE_MAX);
    expect(result.current.settings.theme).toBe("system");
    expect(result.current.settings.uiLanguage).toBe("system");
    expect(result.current.settings.uiFontFamily).toContain("system-ui");
    expect(result.current.settings.codeFontFamily).toContain("ui-monospace");
    expect(result.current.settings.codeFontSize).toBe(16);
    expect(result.current.settings.personality).toBe("friendly");
    expect(result.current.settings.automaticAppUpdateChecksEnabled).toBe(false);
    expect(result.current.settings.backendMode).toBe("remote");
    expect(result.current.settings.remoteBackendHost).toBe("example:1234");
    expect(result.current.settings.quickCommands).toHaveLength(2);
    expect(result.current.settings.quickCommands[0].id).toBeTruthy();
    expect(result.current.settings.quickCommands[1].id).not.toBe(
      result.current.settings.quickCommands[0].id,
    );
    expect(result.current.settings.quickCommands[0].text).toContain("propose a patch");
    expect(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe("system");
  });

  it("keeps defaults when getAppSettings fails", async () => {
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, "zh-CN");
    getAppSettingsMock.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.uiScale).toBe(UI_SCALE_DEFAULT);
    expect(result.current.settings.uiLanguage).toBe("zh-CN");
    expect(result.current.settings.theme).toBe("system");
    expect(result.current.settings.uiFontFamily).toContain("system-ui");
    expect(result.current.settings.codeFontFamily).toContain("ui-monospace");
    expect(result.current.settings.backendMode).toBe("local");
    expect(result.current.settings.dictationModelId).toBe("base");
    expect(result.current.settings.interruptShortcut).toBeTruthy();
    expect(result.current.settings.commonLinks).toEqual([]);
    expect(result.current.settings.automaticAppUpdateChecksEnabled).toBe(false);
  });

  it("persists settings via updateAppSettings and updates local state", async () => {
    getAppSettingsMock.mockResolvedValue({} as AppSettings);
    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const next: AppSettings = {
      ...result.current.settings,
      codexArgs: "--profile dev",
      theme: "nope" as unknown as AppSettings["theme"],
      uiScale: 0.04,
      uiFontFamily: "",
      codeFontFamily: "  ",
      codeFontSize: 2,
      notificationSoundsEnabled: false,
      uiLanguage: "zh-CN",
    };
    const saved: AppSettings = {
      ...result.current.settings,
      codexArgs: "--profile dev",
      theme: "dark",
      uiScale: 2.4,
      uiFontFamily: "Avenir, sans-serif",
      codeFontFamily: "JetBrains Mono, monospace",
      codeFontSize: 13,
      notificationSoundsEnabled: false,
      uiLanguage: "zh-CN",
    };
    updateAppSettingsMock.mockResolvedValue(saved);

    let returned: AppSettings | undefined;
    await act(async () => {
      returned = await result.current.saveSettings(next);
    });

    expect(updateAppSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "system",
        uiScale: 0.1,
        uiFontFamily: expect.stringContaining("system-ui"),
        codeFontFamily: expect.stringContaining("ui-monospace"),
        codeFontSize: 9,
        notificationSoundsEnabled: false,
        uiLanguage: "zh-CN",
      }),
    );
    expect(returned).toEqual(saved);
    expect(result.current.settings.theme).toBe("dark");
    expect(result.current.settings.uiScale).toBe(2.4);
    expect(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe("zh-CN");
  });

  it("surfaces doctor errors", async () => {
    getAppSettingsMock.mockResolvedValue({} as AppSettings);
    runCodexDoctorMock.mockRejectedValue(new Error("doctor fail"));
    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.doctor("/bin/codex", "--profile test")).rejects.toThrow(
      "doctor fail",
    );
    expect(runCodexDoctorMock).toHaveBeenCalledWith(
      "/bin/codex",
      "--profile test",
    );
  });

  it("returns doctor results", async () => {
    getAppSettingsMock.mockResolvedValue({} as AppSettings);
    const response: CodexDoctorResult = {
      ok: true,
      codexBin: "/bin/codex",
      version: "1.0.0",
      appServerOk: true,
      details: null,
      path: null,
      nodeOk: true,
      nodeVersion: "20.0.0",
      nodeDetails: null,
    };
    runCodexDoctorMock.mockResolvedValue(response);
    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.doctor("/bin/codex", null)).resolves.toEqual(
      response,
    );
  });

  it("normalizes common links and preserves unusable drafts", async () => {
    getAppSettingsMock.mockResolvedValue(
      ({
        commonLinks: [
          {
            id: "",
            label: " Docs ",
            url: " https://example.com/docs ",
          },
          {
            id: "",
            label: " Local ",
            url: " ftp://example.com/files ",
          },
        ],
      } as unknown) as AppSettings,
    );

    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.commonLinks).toEqual([
      {
        id: "common-link-1",
        label: "Docs",
        url: "https://example.com/docs",
      },
      {
        id: "common-link-2",
        label: "Local",
        url: "ftp://example.com/files",
      },
    ]);
  });
});
