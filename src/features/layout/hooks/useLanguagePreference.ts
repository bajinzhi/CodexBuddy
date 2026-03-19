import { useEffect } from "react";
import type { UiLanguagePreference } from "@/types";
import i18n, { applyDocumentLanguage } from "@/i18n";
import {
  persistUiLanguagePreference,
  resolveUiLocale,
} from "@/i18n/preferences";

export function useLanguagePreference(uiLanguage: UiLanguagePreference) {
  useEffect(() => {
    const locale = resolveUiLocale(uiLanguage);
    persistUiLanguagePreference(uiLanguage);
    applyDocumentLanguage(locale);
    if (i18n.resolvedLanguage === locale || i18n.language === locale) {
      return;
    }
    void i18n.changeLanguage(locale);
  }, [uiLanguage]);
}
