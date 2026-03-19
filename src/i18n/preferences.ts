import type { SupportedUiLocale, UiLanguagePreference } from "@/types";

export const UI_LANGUAGE_STORAGE_KEY = "codexbuddy.uiLanguage";

const SUPPORTED_UI_LANGUAGES = new Set<UiLanguagePreference>(["system", "en", "zh-CN"]);
const SUPPORTED_UI_LOCALES = new Set<SupportedUiLocale>(["en", "zh-CN"]);

function isBrowserEnvironment() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function normalizeUiLanguagePreference(value: unknown): UiLanguagePreference {
  if (typeof value !== "string") {
    return "system";
  }
  return SUPPORTED_UI_LANGUAGES.has(value as UiLanguagePreference)
    ? (value as UiLanguagePreference)
    : "system";
}

export function normalizeSupportedUiLocale(value: unknown): SupportedUiLocale {
  if (typeof value !== "string") {
    return "en";
  }
  if (SUPPORTED_UI_LOCALES.has(value as SupportedUiLocale)) {
    return value as SupportedUiLocale;
  }
  if (value.toLowerCase().startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
}

export function detectSystemUiLocale(): SupportedUiLocale {
  if (typeof navigator === "undefined") {
    return "en";
  }
  const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.toLowerCase().startsWith("zh")) {
      return "zh-CN";
    }
  }
  return "en";
}

export function resolveUiLocale(
  preference: UiLanguagePreference,
  systemLocale = detectSystemUiLocale(),
): SupportedUiLocale {
  return preference === "system" ? systemLocale : normalizeSupportedUiLocale(preference);
}

export function readCachedUiLanguagePreference(): UiLanguagePreference | null {
  if (!isBrowserEnvironment()) {
    return null;
  }
  const stored = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
  return stored === null ? null : normalizeUiLanguagePreference(stored);
}

export function persistUiLanguagePreference(value: UiLanguagePreference) {
  if (!isBrowserEnvironment()) {
    return;
  }
  window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, normalizeUiLanguagePreference(value));
}

export function getInitialUiLanguagePreference(): UiLanguagePreference {
  return readCachedUiLanguagePreference() ?? "system";
}

export function getInitialUiLocale(): SupportedUiLocale {
  return resolveUiLocale(getInitialUiLanguagePreference());
}
