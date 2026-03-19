import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { Resource } from "i18next";
import type { SupportedUiLocale } from "@/types";
import commonEn from "./locales/en/common.json";
import settingsEn from "./locales/en/settings.json";
import homeEn from "./locales/en/home.json";
import gitEn from "./locales/en/git.json";
import appEn from "./locales/en/app.json";
import commonZhCn from "./locales/zh-CN/common.json";
import settingsZhCn from "./locales/zh-CN/settings.json";
import homeZhCn from "./locales/zh-CN/home.json";
import gitZhCn from "./locales/zh-CN/git.json";
import appZhCn from "./locales/zh-CN/app.json";
import { getInitialUiLocale } from "./preferences";

const resources: Resource = {
  en: {
    common: commonEn,
    settings: settingsEn,
    home: homeEn,
    git: gitEn,
    app: appEn,
  },
  "zh-CN": {
    common: commonZhCn,
    settings: settingsZhCn,
    home: homeZhCn,
    git: gitZhCn,
    app: appZhCn,
  },
};

let initPromise: Promise<typeof i18n> | null = null;

export function applyDocumentLanguage(locale: SupportedUiLocale) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.lang = locale;
}

export function initializeI18n(initialLocale = getInitialUiLocale()) {
  if (i18n.isInitialized) {
    applyDocumentLanguage(initialLocale);
    return Promise.resolve(i18n);
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLocale,
      fallbackLng: "en",
      supportedLngs: ["en", "zh-CN"],
      defaultNS: "common",
      ns: ["common", "settings", "home", "git", "app"],
      interpolation: {
        escapeValue: false,
      },
      returnNull: false,
      react: {
        useSuspense: false,
      },
    })
    .then(() => {
      applyDocumentLanguage(initialLocale);
      return i18n;
    });
  return initPromise;
}

export default i18n;
