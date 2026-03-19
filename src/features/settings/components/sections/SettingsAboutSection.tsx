import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "@/types";
import { formatDateTime } from "@/i18n/format";
import {
  getAppBuildType,
  isMobileRuntime,
  type AppBuildType,
} from "@services/tauri";
import { useUpdater } from "@/features/update/hooks/useUpdater";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

type SettingsAboutSectionProps = {
  appSettings: AppSettings;
  onToggleAutomaticAppUpdateChecks?: () => void;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function SettingsAboutSection({
  appSettings,
  onToggleAutomaticAppUpdateChecks,
}: SettingsAboutSectionProps) {
  const { t } = useTranslation(["settings", "common"]);
  const [appBuildType, setAppBuildType] = useState<AppBuildType | "unknown">("unknown");
  const [updaterEnabled, setUpdaterEnabled] = useState(false);
  const { state: updaterState, checkForUpdates, startUpdate } = useUpdater({
    enabled: updaterEnabled,
    autoCheckOnMount: false,
  });

  useEffect(() => {
    let active = true;
    const loadBuildType = async () => {
      try {
        const value = await getAppBuildType();
        if (active) {
          setAppBuildType(value);
        }
      } catch {
        if (active) {
          setAppBuildType("unknown");
        }
      }
    };
    void loadBuildType();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const detectRuntime = async () => {
      try {
        const mobileRuntime = await isMobileRuntime();
        if (active) {
          setUpdaterEnabled(!mobileRuntime);
        }
      } catch {
        if (active) {
          // In non-Tauri previews we still want local desktop-like behavior.
          setUpdaterEnabled(true);
        }
      }
    };
    void detectRuntime();
    return () => {
      active = false;
    };
  }, []);

  const buildDateValue = __APP_BUILD_DATE__.trim();
  const parsedBuildDate = Date.parse(buildDateValue);
  const buildDateLabel = Number.isNaN(parsedBuildDate)
    ? buildDateValue || t("common:labels.unknown")
    : formatDateTime(new Date(parsedBuildDate));

  return (
    <SettingsSection
      title={t("settings:about.title")}
      subtitle={t("settings:about.subtitle")}
    >
      <div className="settings-field">
        <div className="settings-help">
          {t("settings:about.versionLabel")}: <code>{__APP_VERSION__}</code>
        </div>
        <div className="settings-help">
          {t("settings:about.buildTypeLabel")}: <code>{appBuildType}</code>
        </div>
        <div className="settings-help">
          {t("settings:about.branchLabel")}:{" "}
          <code>{__APP_GIT_BRANCH__ || t("common:labels.unknown")}</code>
        </div>
        <div className="settings-help">
          {t("settings:about.commitLabel")}:{" "}
          <code>{__APP_COMMIT_HASH__ || t("common:labels.unknown")}</code>
        </div>
        <div className="settings-help">
          {t("settings:about.buildDateLabel")}: <code>{buildDateLabel}</code>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-label">{t("settings:about.updatesLabel")}</div>
        <SettingsToggleRow
          title={t("settings:about.automaticChecksTitle")}
          subtitle={t("settings:about.automaticChecksSubtitle")}
        >
          <SettingsToggleSwitch
            pressed={appSettings.automaticAppUpdateChecksEnabled}
            onClick={() => {
              onToggleAutomaticAppUpdateChecks?.();
            }}
          />
        </SettingsToggleRow>
        <div className="settings-help">
          {t("settings:about.currentVersion")} <code>{__APP_VERSION__}</code>
        </div>
        {!updaterEnabled && (
          <div className="settings-help">
            {t("settings:about.unavailable")}
          </div>
        )}

        {updaterState.stage === "error" && (
          <div className="settings-help ds-text-danger">
            {t("settings:about.failed", { error: updaterState.error })}
          </div>
        )}

        {updaterState.stage === "downloading" ||
        updaterState.stage === "installing" ||
        updaterState.stage === "restarting" ? (
          <div className="settings-help">
            {updaterState.stage === "downloading" ? (
              updaterState.progress?.totalBytes
                ? t("settings:about.downloadingPercent", {
                    percent: Math.round(
                      (updaterState.progress.downloadedBytes /
                        updaterState.progress.totalBytes) *
                        100,
                    ),
                  })
                : t("settings:about.downloadingBytes", {
                    bytes: formatBytes(updaterState.progress?.downloadedBytes ?? 0),
                  })
            ) : updaterState.stage === "installing" ? (
              t("settings:about.installing")
            ) : (
              t("settings:about.restarting")
            )}
          </div>
        ) : updaterState.stage === "available" ? (
          <div className="settings-help">
            {t("settings:about.versionAvailable", { version: updaterState.version })}
          </div>
        ) : updaterState.stage === "latest" ? (
          <div className="settings-help">{t("settings:about.latest")}</div>
        ) : null}

        <div className="settings-controls">
          {updaterState.stage === "available" ? (
            <button
              type="button"
              className="primary"
              disabled={!updaterEnabled}
              onClick={() => void startUpdate()}
            >
              {t("settings:about.downloadInstall")}
            </button>
          ) : (
            <button
              type="button"
              className="ghost"
              disabled={
                !updaterEnabled ||
                updaterState.stage === "checking" ||
                updaterState.stage === "downloading" ||
                updaterState.stage === "installing" ||
                updaterState.stage === "restarting"
              }
              onClick={() => void checkForUpdates({ announceNoUpdate: true })}
            >
              {updaterState.stage === "checking"
                ? t("settings:about.checking")
                : t("settings:about.checkForUpdates")}
            </button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
