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

function isLowRemaining(percent: number | null, showRemaining: boolean) {
  if (percent === null) {
    return false;
  }

  const remainingPercent = showRemaining ? percent : 100 - percent;
  return remainingPercent < LOW_REMAINING_THRESHOLD;
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
        <div className="usage-block">
          <div className="usage-label">
            <span className="usage-title">
              <span>{t("sidebar.session")}</span>
              {sessionResetLabel && (
                <span className="usage-reset">· {sessionResetLabel}</span>
              )}
            </span>
            <span
              className={`usage-value${isLowRemaining(sessionPercent, showRemaining) ? " is-danger" : ""}`}
            >
              {sessionPercent === null ? "--" : `${sessionPercent}%`}
            </span>
          </div>
          <div className="usage-bar">
            <span
              className="usage-bar-fill"
              style={{ width: `${sessionPercent ?? 0}%` }}
            />
          </div>
        </div>
        {showWeekly && (
          <div className="usage-block">
            <div className="usage-label">
              <span className="usage-title">
                <span>{t("sidebar.weekly")}</span>
                {weeklyResetLabel && (
                  <span className="usage-reset">· {weeklyResetLabel}</span>
                )}
              </span>
              <span
                className={`usage-value${isLowRemaining(weeklyPercent, showRemaining) ? " is-danger" : ""}`}
              >
                {weeklyPercent === null ? "--" : `${weeklyPercent}%`}
              </span>
            </div>
            <div className="usage-bar">
              <span
                className="usage-bar-fill"
                style={{ width: `${weeklyPercent ?? 0}%` }}
              />
            </div>
          </div>
        )}
      </div>
      {creditsLabel && <div className="usage-meta">{creditsLabel}</div>}
    </div>
  );
}
