import type { CodexFeature } from "@/types";
import { useTranslation } from "react-i18next";
import {
  SettingsSection,
  SettingsSubsection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import type { SettingsFeaturesSectionProps } from "@settings/hooks/useSettingsFeaturesSection";
import { fileManagerName, openInFileManagerLabel } from "@utils/platformPaths";

function formatFeatureLabel(feature: CodexFeature, translateLabel: (key: string) => string): string {
  const displayName = feature.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  const localized = translateLabel(feature.name);
  if (localized) {
    return localized;
  }
  return feature.name
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function featureSubtitle(
  feature: CodexFeature,
  translateDescription: (key: string) => string,
  stageDescriptions: {
    deprecated: string;
    removed: string;
    featureKey: (name: string) => string;
  },
): string {
  if (feature.description?.trim()) {
    return feature.description;
  }
  if (feature.announcement?.trim()) {
    return feature.announcement;
  }
  const localizedDescription = translateDescription(feature.name);
  if (localizedDescription) {
    return localizedDescription;
  }
  if (feature.stage === "deprecated") {
    return stageDescriptions.deprecated;
  }
  if (feature.stage === "removed") {
    return stageDescriptions.removed;
  }
  return stageDescriptions.featureKey(feature.name);
}

export function SettingsFeaturesSection({
  appSettings,
  hasFeatureWorkspace,
  openConfigError,
  featureError,
  featuresLoading,
  featureUpdatingKey,
  stableFeatures,
  experimentalFeatures,
  hasDynamicFeatureRows,
  onOpenConfig,
  onToggleCodexFeature,
  onUpdateAppSettings,
}: SettingsFeaturesSectionProps) {
  const { t } = useTranslation(["settings", "common"]);
  const translateFeatureLabel = (name: string) => {
    const value = t(`features.featureLabels.${name}`, { defaultValue: "" });
    return value.trim();
  };
  const translateFeatureDescription = (name: string) => {
    const value = t(`features.featureDescriptions.${name}`, { defaultValue: "" });
    return value.trim();
  };
  return (
    <SettingsSection
      title={t("features.title")}
      subtitle={t("features.subtitle")}
    >
      <SettingsToggleRow
        title={t("features.configFileTitle")}
        subtitle={t("features.configFileSubtitle", { fileManager: fileManagerName() })}
      >
        <button type="button" className="ghost" onClick={onOpenConfig}>
          {t("features.openConfigButton", {
            fileManager: fileManagerName(),
            defaultValue: openInFileManagerLabel(),
          })}
        </button>
      </SettingsToggleRow>
      {openConfigError && <div className="settings-help">{openConfigError}</div>}
      <SettingsSubsection
        title={t("features.stableTitle")}
        subtitle={t("features.stableSubtitle")}
      />
      <SettingsToggleRow
        title={t("features.personalityTitle")}
        subtitle={
          t("features.personalitySubtitle")
        }
      >
        <select
          id="features-personality-select"
          className="settings-select"
          value={appSettings.personality}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              personality: event.target.value as (typeof appSettings)["personality"],
            })
          }
          aria-label={t("features.personalityTitle")}
        >
          <option value="friendly">{t("features.personalityOptions.friendly")}</option>
          <option value="pragmatic">{t("features.personalityOptions.pragmatic")}</option>
        </select>
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("features.pauseQueuedTitle")}
        subtitle={t("features.pauseQueuedSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.pauseQueuedMessagesWhenResponseRequired}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              pauseQueuedMessagesWhenResponseRequired:
                !appSettings.pauseQueuedMessagesWhenResponseRequired,
            })
          }
        />
      </SettingsToggleRow>
      {stableFeatures.map((feature) => (
        <SettingsToggleRow
          key={feature.name}
          title={formatFeatureLabel(feature, translateFeatureLabel)}
          subtitle={featureSubtitle(feature, translateFeatureDescription, {
            deprecated: t("features.deprecated"),
            removed: t("features.removed"),
            featureKey: (name) => t("features.featureKey", { name }),
          })}
        >
          <SettingsToggleSwitch
            pressed={feature.enabled}
            onClick={() => onToggleCodexFeature(feature)}
            disabled={featureUpdatingKey === feature.name}
          />
        </SettingsToggleRow>
      ))}
      {hasFeatureWorkspace &&
        !featuresLoading &&
        !featureError &&
        stableFeatures.length === 0 && (
        <div className="settings-help">{t("features.noStable")}</div>
      )}
      <SettingsSubsection
        title={t("features.experimentalTitle")}
        subtitle={t("features.experimentalSubtitle")}
      />
      {experimentalFeatures.map((feature) => (
        <SettingsToggleRow
          key={feature.name}
          title={formatFeatureLabel(feature, translateFeatureLabel)}
          subtitle={featureSubtitle(feature, translateFeatureDescription, {
            deprecated: t("features.deprecated"),
            removed: t("features.removed"),
            featureKey: (name) => t("features.featureKey", { name }),
          })}
        >
          <SettingsToggleSwitch
            pressed={feature.enabled}
            onClick={() => onToggleCodexFeature(feature)}
            disabled={featureUpdatingKey === feature.name}
          />
        </SettingsToggleRow>
      ))}
      {hasFeatureWorkspace &&
        !featuresLoading &&
        !featureError &&
        hasDynamicFeatureRows &&
        experimentalFeatures.length === 0 && (
          <div className="settings-help">
            {t("features.noExperimental")}
          </div>
        )}
      {featuresLoading && (
        <div className="settings-help">{t("features.loading")}</div>
      )}
      {!hasFeatureWorkspace && !featuresLoading && (
        <div className="settings-help">
          {t("features.connectWorkspace")}
        </div>
      )}
      {featureError && <div className="settings-help">{featureError}</div>}
    </SettingsSection>
  );
}
