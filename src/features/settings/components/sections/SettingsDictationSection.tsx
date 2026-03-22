import type { AppSettings, DictationModelStatus } from "@/types";
import { useTranslation } from "react-i18next";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { formatDownloadSize } from "@utils/formatting";

type DictationModelOption = {
  id: string;
  label: string;
  size: string;
  note: string;
};

type SettingsDictationSectionProps = {
  appSettings: AppSettings;
  optionKeyLabel: string;
  metaKeyLabel: string;
  dictationModels: DictationModelOption[];
  selectedDictationModel: DictationModelOption;
  dictationModelStatus?: DictationModelStatus | null;
  dictationReady: boolean;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onDownloadDictationModel?: () => void;
  onCancelDictationDownload?: () => void;
  onRemoveDictationModel?: () => void;
};

export function SettingsDictationSection({
  appSettings,
  optionKeyLabel,
  metaKeyLabel,
  dictationModels,
  selectedDictationModel,
  dictationModelStatus,
  dictationReady,
  onUpdateAppSettings,
  onDownloadDictationModel,
  onCancelDictationDownload,
  onRemoveDictationModel,
}: SettingsDictationSectionProps) {
  const { t } = useTranslation(["settings", "common"]);
  const dictationProgress = dictationModelStatus?.progress ?? null;
  const languageOptions = [
    { value: "", label: t("dictation.languages.autoDetect") },
    { value: "en", label: t("dictation.languages.en") },
    { value: "es", label: t("dictation.languages.es") },
    { value: "fr", label: t("dictation.languages.fr") },
    { value: "de", label: t("dictation.languages.de") },
    { value: "it", label: t("dictation.languages.it") },
    { value: "pt", label: t("dictation.languages.pt") },
    { value: "nl", label: t("dictation.languages.nl") },
    { value: "sv", label: t("dictation.languages.sv") },
    { value: "no", label: t("dictation.languages.no") },
    { value: "da", label: t("dictation.languages.da") },
    { value: "fi", label: t("dictation.languages.fi") },
    { value: "pl", label: t("dictation.languages.pl") },
    { value: "tr", label: t("dictation.languages.tr") },
    { value: "ru", label: t("dictation.languages.ru") },
    { value: "uk", label: t("dictation.languages.uk") },
    { value: "ja", label: t("dictation.languages.ja") },
    { value: "ko", label: t("dictation.languages.ko") },
    { value: "zh", label: t("dictation.languages.zh") },
  ];
  const holdKeyOptions = [
    { value: "", label: t("dictation.holdKeyOptions.off") },
    { value: "alt", label: optionKeyLabel },
    { value: "shift", label: t("dictation.holdKeyOptions.shift") },
    { value: "control", label: t("dictation.holdKeyOptions.control") },
    { value: "meta", label: metaKeyLabel },
  ];

  return (
    <SettingsSection
      title={t("dictation.title")}
      subtitle={t("dictation.subtitle")}
    >
      <SettingsToggleRow
        title={t("dictation.enableTitle")}
        subtitle={t("dictation.enableSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.dictationEnabled}
          onClick={() => {
            const nextEnabled = !appSettings.dictationEnabled;
            void onUpdateAppSettings({
              ...appSettings,
              dictationEnabled: nextEnabled,
            });
            if (
              !nextEnabled &&
              dictationModelStatus?.state === "downloading" &&
              onCancelDictationDownload
            ) {
              onCancelDictationDownload();
            }
            if (
              nextEnabled &&
              dictationModelStatus?.state === "missing" &&
              onDownloadDictationModel
            ) {
              onDownloadDictationModel();
            }
          }}
        />
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-model">
          {t("dictation.modelLabel")}
        </label>
        <select
          id="dictation-model"
          className="settings-select"
          value={appSettings.dictationModelId}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              dictationModelId: event.target.value,
            })
          }
        >
          {dictationModels.map((model) => (
            <option key={model.id} value={model.id}>
              {t(`dictation.models.${model.id}.label`, { defaultValue: model.label })} ({model.size})
            </option>
          ))}
        </select>
        <div className="settings-help">
          {t(`dictation.models.${selectedDictationModel.id}.note`, {
            defaultValue: selectedDictationModel.note,
          })}{" "}
          {t("dictation.downloadSize", { size: selectedDictationModel.size })}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-language">
          {t("dictation.languageLabel")}
        </label>
        <select
          id="dictation-language"
          className="settings-select"
          value={appSettings.dictationPreferredLanguage ?? ""}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              dictationPreferredLanguage: event.target.value || null,
            })
          }
        >
          {languageOptions.map((option) => (
            <option key={option.value || "auto"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="settings-help">
          {t("dictation.languageHelp")}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="dictation-hold-key">
          {t("dictation.holdKeyLabel")}
        </label>
        <select
          id="dictation-hold-key"
          className="settings-select"
          value={appSettings.dictationHoldKey ?? ""}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              dictationHoldKey: event.target.value,
            })
          }
        >
          {holdKeyOptions.map((option) => (
            <option key={option.value || "off"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="settings-help">
          {t("dictation.holdKeyHelp")}
        </div>
      </div>
      {dictationModelStatus && (
        <div className="settings-field">
          <div className="settings-field-label">
            {t("dictation.modelStatusLabel", {
              model: t(`dictation.models.${selectedDictationModel.id}.label`, {
                defaultValue: selectedDictationModel.label,
              }),
            })}
          </div>
          <div className="settings-help">
            {dictationModelStatus.state === "ready" && t("dictation.status.ready")}
            {dictationModelStatus.state === "missing" && t("dictation.status.missing")}
            {dictationModelStatus.state === "downloading" && t("dictation.status.downloading")}
            {dictationModelStatus.state === "error" &&
              (dictationModelStatus.error ?? t("dictation.status.errorFallback"))}
          </div>
          {dictationProgress && (
            <div className="settings-download-progress">
              <div className="settings-download-bar">
                <div
                  className="settings-download-fill"
                  style={{
                    width: dictationProgress.totalBytes
                      ? `${Math.min(
                          100,
                          (dictationProgress.downloadedBytes / dictationProgress.totalBytes) * 100,
                        )}%`
                      : "0%",
                  }}
                />
              </div>
              <div className="settings-download-meta">
                {formatDownloadSize(dictationProgress.downloadedBytes)}
              </div>
            </div>
          )}
          <div className="settings-field-actions">
            {dictationModelStatus.state === "missing" && (
              <button
                type="button"
                className="primary"
                onClick={onDownloadDictationModel}
                disabled={!onDownloadDictationModel}
              >
                {t("dictation.downloadModel")}
              </button>
            )}
            {dictationModelStatus.state === "downloading" && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onCancelDictationDownload}
                disabled={!onCancelDictationDownload}
              >
                {t("dictation.cancelDownload")}
              </button>
            )}
            {dictationReady && (
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={onRemoveDictationModel}
                disabled={!onRemoveDictationModel}
              >
                {t("dictation.removeModel")}
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
