import type { RateLimitSnapshot } from "../../../types";
import { translate } from "@/i18n/translate";
import { formatRelativeTime } from "../../../utils/time";

type UsageLabels = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
};

const clampPercent = (value: number) =>
  Math.min(Math.max(Math.round(value), 0), 100);

function formatResetLabel(resetsAt?: number | null) {
  if (typeof resetsAt !== "number" || !Number.isFinite(resetsAt)) {
    return null;
  }
  const resetMs = resetsAt > 1_000_000_000_000 ? resetsAt : resetsAt * 1000;
  return translate("resetAt", {
    ns: "app",
    relative: formatRelativeTime(resetMs),
  });
}

function formatCreditsLabel(accountRateLimits: RateLimitSnapshot | null) {
  const credits = accountRateLimits?.credits ?? null;
  if (!credits?.hasCredits) {
    return null;
  }
  if (credits.unlimited) {
    return translate("credits.availableUnlimited", { ns: "app" });
  }
  const balance = credits.balance?.trim() ?? "";
  if (!balance) {
    return null;
  }
  const intValue = Number.parseInt(balance, 10);
  if (Number.isFinite(intValue) && intValue > 0) {
    return translate("credits.available", { ns: "app", value: intValue });
  }
  const floatValue = Number.parseFloat(balance);
  if (Number.isFinite(floatValue) && floatValue > 0) {
    const rounded = Math.round(floatValue);
    return rounded > 0
      ? translate("credits.available", { ns: "app", value: rounded })
      : null;
  }
  return null;
}

export function getUsageLabels(
  accountRateLimits: RateLimitSnapshot | null,
  showRemaining: boolean,
): UsageLabels {
  const usagePercent = accountRateLimits?.primary?.usedPercent;
  const globalUsagePercent = accountRateLimits?.secondary?.usedPercent;
  const sessionPercent =
    typeof usagePercent === "number"
      ? showRemaining
        ? 100 - clampPercent(usagePercent)
        : clampPercent(usagePercent)
      : null;
  const weeklyPercent =
    typeof globalUsagePercent === "number"
      ? showRemaining
        ? 100 - clampPercent(globalUsagePercent)
        : clampPercent(globalUsagePercent)
      : null;

  return {
    sessionPercent,
    weeklyPercent,
    sessionResetLabel: formatResetLabel(accountRateLimits?.primary?.resetsAt),
    weeklyResetLabel: formatResetLabel(accountRateLimits?.secondary?.resetsAt),
    creditsLabel: formatCreditsLabel(accountRateLimits),
    showWeekly: Boolean(accountRateLimits?.secondary),
  };
}
