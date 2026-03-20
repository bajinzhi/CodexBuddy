import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

type SidebarFooterProps = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
  showRemaining: boolean;
};

const LOW_REMAINING_THRESHOLD = 25;
const WARNING_REMAINING_THRESHOLD = 50;

type UsageState = "unknown" | "healthy" | "warning" | "critical";

function clampPercent(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

function getRemainingPercent(percent: number | null, showRemaining: boolean) {
  if (percent === null) {
    return null;
  }
  return clampPercent(showRemaining ? percent : 100 - percent);
}

function getUsageState(remainingPercent: number | null): UsageState {
  if (remainingPercent === null) {
    return "unknown";
  }
  if (remainingPercent <= LOW_REMAINING_THRESHOLD) {
    return "critical";
  }
  if (remainingPercent <= WARNING_REMAINING_THRESHOLD) {
    return "warning";
  }
  return "healthy";
}

function getUsageHue(remainingPercent: number | null) {
  if (remainingPercent === null) {
    return 0;
  }
  if (remainingPercent <= WARNING_REMAINING_THRESHOLD) {
    return Math.round(
      8 + (Math.max(remainingPercent, 0) / WARNING_REMAINING_THRESHOLD) * 50,
    );
  }
  return Math.round(
    58 +
      ((Math.min(remainingPercent, 100) - WARNING_REMAINING_THRESHOLD) /
        (100 - WARNING_REMAINING_THRESHOLD)) *
        80,
  );
}

type SidebarUsageBarProps = {
  label: string;
  percent: number | null;
  resetLabel: string | null;
  showRemaining: boolean;
};

function SidebarUsageBar({
  label,
  percent,
  resetLabel,
  showRemaining,
}: SidebarUsageBarProps) {
  const displayPercent = percent === null ? null : clampPercent(Math.round(percent));
  const remainingPercent = getRemainingPercent(displayPercent, showRemaining);
  const state = getUsageState(remainingPercent);
  const readout = displayPercent === null ? "--" : `${displayPercent}%`;
  const usageStyle = {
    "--usage-fill": displayPercent ?? 0,
    "--usage-hue": `${getUsageHue(remainingPercent)}deg`,
  } as CSSProperties;

  return (
    <div className="usage-block" data-state={state}>
      <div className="usage-label">
        <span className="usage-title">
          <span>{label}</span>
          {resetLabel && <span className="usage-reset">· {resetLabel}</span>}
        </span>
        <span
          className={`usage-value${state === "critical" ? " is-danger" : state === "warning" ? " is-warning" : ""}`}
        >
          {readout}
        </span>
      </div>
      <div
        className="usage-bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={displayPercent ?? undefined}
        aria-valuetext={readout}
        title={`${label} - ${readout}`}
        style={usageStyle}
      >
        <span className="usage-bar-fill" aria-hidden />
      </div>
    </div>
  );
}

export function SidebarFooter({
  sessionPercent,
  weeklyPercent,
  sessionResetLabel,
  weeklyResetLabel,
  creditsLabel,
  showWeekly,
  showRemaining,
}: SidebarFooterProps) {
  const { t } = useTranslation("app");
  return (
    <div className="sidebar-footer">
      <div className="usage-bars">
        <SidebarUsageBar
          label={t("sidebar.session")}
          percent={sessionPercent}
          resetLabel={sessionResetLabel}
          showRemaining={showRemaining}
        />
        {showWeekly && (
          <SidebarUsageBar
            label={t("sidebar.weekly")}
            percent={weeklyPercent}
            resetLabel={weeklyResetLabel}
            showRemaining={showRemaining}
          />
        )}
      </div>
      {creditsLabel && <div className="usage-meta">{creditsLabel}</div>}
    </div>
  );
}
