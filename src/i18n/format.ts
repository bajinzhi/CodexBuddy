import i18n from "./index";
import { getInitialUiLocale, normalizeSupportedUiLocale } from "./preferences";

function getFormatterLocale(locale?: string) {
  if (locale) {
    return normalizeSupportedUiLocale(locale);
  }
  return normalizeSupportedUiLocale(i18n.resolvedLanguage || i18n.language || getInitialUiLocale());
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: string,
) {
  return new Intl.NumberFormat(getFormatterLocale(locale), options).format(value);
}

export function formatDateTime(
  value: number | Date,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
) {
  return new Intl.DateTimeFormat(getFormatterLocale(locale), options).format(value);
}

export function formatTime(
  value: number | Date,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
) {
  return formatDateTime(
    value,
    {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      ...options,
    },
    locale,
  );
}

export function formatRelativeTimeValue(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
  locale?: string,
) {
  return new Intl.RelativeTimeFormat(getFormatterLocale(locale), {
    numeric: "auto",
    ...options,
  }).format(value, unit);
}
