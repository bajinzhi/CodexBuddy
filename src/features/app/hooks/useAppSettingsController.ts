import { useThemePreference } from "../../layout/hooks/useThemePreference";
import { useLanguagePreference } from "../../layout/hooks/useLanguagePreference";
import { useTransparencyPreference } from "../../layout/hooks/useTransparencyPreference";
import { useUiScaleShortcuts } from "../../layout/hooks/useUiScaleShortcuts";
import { useAppSettings } from "../../settings/hooks/useAppSettings";
import { runCodexUpdate, runCodexUpdateCheck } from "../../../services/tauri";

export function useAppSettingsController() {
  const {
    settings: appSettings,
    setSettings: setAppSettings,
    saveSettings,
    doctor,
    isLoading: appSettingsLoading,
  } = useAppSettings();

  useLanguagePreference(appSettings.uiLanguage);
  useThemePreference(appSettings.theme);
  const { reduceTransparency, setReduceTransparency } =
    useTransparencyPreference();

  const {
    uiScale,
    scaleShortcutTitle,
    scaleShortcutText,
    queueSaveSettings,
  } = useUiScaleShortcuts({
    settings: appSettings,
    setSettings: setAppSettings,
    saveSettings,
  });

  return {
    appSettings,
    setAppSettings,
    saveSettings,
    queueSaveSettings,
    doctor,
    codexUpdateCheck: (codexBin: string | null, codexArgs: string | null) =>
      runCodexUpdateCheck(codexBin, codexArgs),
    codexUpdate: (
      codexBin: string | null,
      codexArgs: string | null,
      killActiveSessions = false,
    ) => runCodexUpdate(codexBin, codexArgs, killActiveSessions),
    appSettingsLoading,
    reduceTransparency,
    setReduceTransparency,
    uiScale,
    scaleShortcutTitle,
    scaleShortcutText,
  };
}
