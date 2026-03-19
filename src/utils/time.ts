import i18n from "@/i18n";
import { formatRelativeTimeValue } from "@/i18n/format";
import { normalizeSupportedUiLocale } from "@/i18n/preferences";
import { translate } from "@/i18n/translate";

export function formatRelativeTime(timestamp: number) {
  const now = Date.now();
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 5) {
    return translate("status.now", { ns: "common" });
  }
  const ranges: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
    { unit: "year", seconds: 60 * 60 * 24 * 365 },
    { unit: "month", seconds: 60 * 60 * 24 * 30 },
    { unit: "week", seconds: 60 * 60 * 24 * 7 },
    { unit: "day", seconds: 60 * 60 * 24 },
    { unit: "hour", seconds: 60 * 60 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ];
  const range =
    ranges.find((entry) => absSeconds >= entry.seconds) ||
    ranges[ranges.length - 1];
  if (!range) {
    return translate("status.now", { ns: "common" });
  }
  const value = Math.round(diffSeconds / range.seconds);
  return formatRelativeTimeValue(value, range.unit);
}

export function formatRelativeTimeShort(timestamp: number) {
  const now = Date.now();
  const absSeconds = Math.abs(Math.round((timestamp - now) / 1000));
  const locale = normalizeSupportedUiLocale(i18n.resolvedLanguage || i18n.language);
  const units =
    locale === "zh-CN"
      ? {
          minute: "分",
          hour: "小时",
          day: "天",
          week: "周",
          month: "个月",
          year: "年",
        }
      : {
          minute: "m",
          hour: "h",
          day: "d",
          week: "w",
          month: "mo",
          year: "y",
        };
  if (absSeconds < 60) {
    return translate("status.now", { ns: "common" });
  }
  if (absSeconds < 60 * 60) {
    return `${Math.max(1, Math.round(absSeconds / 60))}${units.minute}`;
  }
  if (absSeconds < 60 * 60 * 24) {
    return `${Math.max(1, Math.round(absSeconds / (60 * 60)))}${units.hour}`;
  }
  if (absSeconds < 60 * 60 * 24 * 7) {
    return `${Math.max(1, Math.round(absSeconds / (60 * 60 * 24)))}${units.day}`;
  }
  if (absSeconds < 60 * 60 * 24 * 30) {
    return `${Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 7)))}${units.week}`;
  }
  if (absSeconds < 60 * 60 * 24 * 365) {
    return `${Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 30)))}${units.month}`;
  }
  return `${Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 365)))}${units.year}`;
}
