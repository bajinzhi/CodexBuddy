import type { AppSettings } from "@/types";
import { useTranslation } from "react-i18next";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

type ComposerPreset = AppSettings["composerEditorPreset"];

type SettingsComposerSectionProps = {
  appSettings: AppSettings;
  optionKeyLabel: string;
  followUpShortcutLabel: string;
  composerPresetLabels: Record<ComposerPreset, string>;
  onComposerPresetChange: (preset: ComposerPreset) => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsComposerSection({
  appSettings,
  optionKeyLabel,
  followUpShortcutLabel,
  composerPresetLabels,
  onComposerPresetChange,
  onUpdateAppSettings,
}: SettingsComposerSectionProps) {
  const { t } = useTranslation(["settings", "common"]);
  const steerUnavailable = !appSettings.steerEnabled;
  return (
    <SettingsSection
      title={t("composer.title")}
      subtitle={t("composer.subtitle")}
    >
      <div className="settings-field">
        <div className="settings-field-label">{t("composer.followUpBehaviorLabel")}</div>
        <div
          className={`settings-segmented${appSettings.followUpMessageBehavior === "steer" ? " is-second-active" : ""}`}
          aria-label={t("composer.followUpBehaviorLabel")}
        >
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "queue" ? " is-active" : ""
            }`}
          >
            <input
              className="settings-segmented-input"
              type="radio"
              name="follow-up-behavior"
              value="queue"
              checked={appSettings.followUpMessageBehavior === "queue"}
              onChange={() =>
                void onUpdateAppSettings({
                  ...appSettings,
                  followUpMessageBehavior: "queue",
                })
              }
            />
            <span className="settings-segmented-option-label">{t("composer.behaviors.queue")}</span>
          </label>
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "steer" ? " is-active" : ""
            }${steerUnavailable ? " is-disabled" : ""}`}
            title={steerUnavailable ? t("composer.steerUnavailable") : ""}
          >
            <input
              className="settings-segmented-input"
              type="radio"
              name="follow-up-behavior"
              value="steer"
              checked={appSettings.followUpMessageBehavior === "steer"}
              disabled={steerUnavailable}
              onChange={() => {
                if (steerUnavailable) {
                  return;
                }
                void onUpdateAppSettings({
                  ...appSettings,
                  followUpMessageBehavior: "steer",
                });
              }}
            />
            <span className="settings-segmented-option-label">{t("composer.behaviors.steer")}</span>
          </label>
        </div>
        <div className="settings-help">
          {t("composer.followUpBehaviorHelp", {
            shortcut: followUpShortcutLabel,
          })}
        </div>
        <SettingsToggleRow
          title={t("composer.showFollowUpHintTitle")}
          subtitle={t("composer.showFollowUpHintSubtitle")}
        >
          <SettingsToggleSwitch
            pressed={appSettings.composerFollowUpHintEnabled}
            onClick={() =>
              void onUpdateAppSettings({
                ...appSettings,
                composerFollowUpHintEnabled: !appSettings.composerFollowUpHintEnabled,
              })
            }
          />
        </SettingsToggleRow>
        {steerUnavailable && (
          <div className="settings-help">{t("composer.steerUnavailableHelp")}</div>
        )}
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("composer.presetsTitle")}</div>
      <div className="settings-subsection-subtitle">
        {t("composer.presetsSubtitle")}
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          {t("composer.presetLabel")}
        </label>
        <select
          id="composer-preset"
          className="settings-select"
          value={appSettings.composerEditorPreset}
          onChange={(event) =>
            onComposerPresetChange(event.target.value as ComposerPreset)
          }
        >
          {Object.entries(composerPresetLabels).map(([preset, label]) => (
            <option key={preset} value={preset}>
              {t(`composer.presetOptions.${preset}`, { defaultValue: label })}
            </option>
          ))}
        </select>
        <div className="settings-help">
          {t("composer.presetHelp")}
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("composer.codeFencesTitle")}</div>
      <SettingsToggleRow
        title={t("composer.expandOnSpaceTitle")}
        subtitle={t("composer.expandOnSpaceSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceExpandOnSpace}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnSpace: !appSettings.composerFenceExpandOnSpace,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("composer.expandOnEnterTitle")}
        subtitle={t("composer.expandOnEnterSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceExpandOnEnter}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnEnter: !appSettings.composerFenceExpandOnEnter,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("composer.languageTagsTitle")}
        subtitle={t("composer.languageTagsSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceLanguageTags}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceLanguageTags: !appSettings.composerFenceLanguageTags,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("composer.wrapSelectionTitle")}
        subtitle={t("composer.wrapSelectionSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceWrapSelection}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceWrapSelection: !appSettings.composerFenceWrapSelection,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("composer.copyWithoutFencesTitle")}
        subtitle={
          t("composer.copyWithoutFencesSubtitle", { key: optionKeyLabel })
        }
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerCodeBlockCopyUseModifier}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerCodeBlockCopyUseModifier:
                !appSettings.composerCodeBlockCopyUseModifier,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("composer.pastingTitle")}</div>
      <SettingsToggleRow
        title={t("composer.autoWrapMultilineTitle")}
        subtitle={t("composer.autoWrapMultilineSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceAutoWrapPasteMultiline}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteMultiline:
                !appSettings.composerFenceAutoWrapPasteMultiline,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("composer.autoWrapCodeLikeTitle")}
        subtitle={t("composer.autoWrapCodeLikeSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceAutoWrapPasteCodeLike}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteCodeLike:
                !appSettings.composerFenceAutoWrapPasteCodeLike,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("composer.listsTitle")}</div>
      <SettingsToggleRow
        title={t("composer.continueListsTitle")}
        subtitle={t("composer.continueListsSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerListContinuation}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerListContinuation: !appSettings.composerListContinuation,
            })
          }
        />
      </SettingsToggleRow>
    </SettingsSection>
  );
}
