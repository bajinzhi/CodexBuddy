import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/features/design-system/components/settings/SettingsPrimitives";
import type { OpenAppTarget } from "@/types";
import {
  fileManagerName,
  isMacPlatform,
} from "@utils/platformPaths";
import {
  GENERIC_APP_ICON,
  getKnownOpenAppIcon,
} from "@app/utils/openAppIcons";
import type { OpenAppDraft } from "@settings/components/settingsTypes";

type SettingsOpenAppsSectionProps = {
  openAppDrafts: OpenAppDraft[];
  openAppSelectedId: string;
  openAppIconById: Record<string, string>;
  onOpenAppDraftChange: (index: number, updates: Partial<OpenAppDraft>) => void;
  onOpenAppKindChange: (index: number, kind: OpenAppTarget["kind"]) => void;
  onCommitOpenApps: () => void;
  onMoveOpenApp: (index: number, direction: "up" | "down") => void;
  onDeleteOpenApp: (index: number) => void;
  onAddOpenApp: () => void;
  onSelectOpenAppDefault: (id: string) => void;
};

const isOpenAppLabelValid = (label: string) => label.trim().length > 0;

export function SettingsOpenAppsSection({
  openAppDrafts,
  openAppSelectedId,
  openAppIconById,
  onOpenAppDraftChange,
  onOpenAppKindChange,
  onCommitOpenApps,
  onMoveOpenApp,
  onDeleteOpenApp,
  onAddOpenApp,
  onSelectOpenAppDefault,
}: SettingsOpenAppsSectionProps) {
  const { t } = useTranslation(["settings", "common"]);
  const fileManagerLabel = fileManagerName();
  return (
    <SettingsSection
      title={t("openApps.title")}
      subtitle={t("openApps.subtitle")}
    >
      <div className="settings-open-apps">
        {openAppDrafts.map((target, index) => {
          const iconSrc =
            getKnownOpenAppIcon(target.id) ?? openAppIconById[target.id] ?? GENERIC_APP_ICON;
          const labelValid = isOpenAppLabelValid(target.label);
          const appNameValid = target.kind !== "app" || Boolean(target.appName?.trim());
          const commandValid =
            target.kind !== "command" || Boolean(target.command?.trim());
          const isComplete = labelValid && appNameValid && commandValid;
          const incompleteHint = !labelValid
            ? t("openApps.incomplete.labelRequired")
            : target.kind === "app"
              ? t("openApps.incomplete.appNameRequired")
              : target.kind === "command"
                ? t("openApps.incomplete.commandRequired")
                : t("openApps.incomplete.completeRequired");

          return (
            <div
              key={target.id}
              className={`settings-open-app-row${isComplete ? "" : " is-incomplete"}`}
            >
              <div className="settings-open-app-icon-wrap" aria-hidden>
                <img
                  className="settings-open-app-icon"
                  src={iconSrc}
                  alt=""
                  width={18}
                  height={18}
                />
              </div>
              <div className="settings-open-app-fields">
                <label className="settings-open-app-field settings-open-app-field--label">
                  <span className="settings-visually-hidden">{t("labels.label", { ns: "common" })}</span>
                  <input
                    className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--label"
                    value={target.label}
                    placeholder={t("labels.label", { ns: "common" })}
                    onChange={(event) =>
                      onOpenAppDraftChange(index, {
                        label: event.target.value,
                      })
                    }
                    onBlur={onCommitOpenApps}
                    aria-label={t("openApps.aria.label", { index: index + 1 })}
                    data-invalid={!labelValid || undefined}
                  />
                </label>
                <label className="settings-open-app-field settings-open-app-field--type">
                  <span className="settings-visually-hidden">{t("labels.type", { ns: "common" })}</span>
                  <select
                    className="settings-select settings-select--compact settings-open-app-kind"
                    value={target.kind}
                    onChange={(event) =>
                      onOpenAppKindChange(index, event.target.value as OpenAppTarget["kind"])
                    }
                    aria-label={t("openApps.aria.type", { index: index + 1 })}
                  >
                    <option value="app">{t("openApps.typeOptions.app")}</option>
                    <option value="command">{t("openApps.typeOptions.command")}</option>
                    <option value="finder">{fileManagerLabel}</option>
                  </select>
                </label>
                {target.kind === "app" && (
                  <label className="settings-open-app-field settings-open-app-field--appname">
                    <span className="settings-visually-hidden">{t("labels.appName", { ns: "common" })}</span>
                    <input
                      className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--appname"
                      value={target.appName ?? ""}
                      placeholder={t("labels.appName", { ns: "common" })}
                      onChange={(event) =>
                        onOpenAppDraftChange(index, {
                          appName: event.target.value,
                        })
                      }
                      onBlur={onCommitOpenApps}
                      aria-label={t("openApps.aria.appName", { index: index + 1 })}
                      data-invalid={!appNameValid || undefined}
                    />
                  </label>
                )}
                {target.kind === "command" && (
                  <label className="settings-open-app-field settings-open-app-field--command">
                    <span className="settings-visually-hidden">{t("labels.command", { ns: "common" })}</span>
                    <input
                      className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--command"
                      value={target.command ?? ""}
                      placeholder={t("labels.command", { ns: "common" })}
                      onChange={(event) =>
                        onOpenAppDraftChange(index, {
                          command: event.target.value,
                        })
                      }
                      onBlur={onCommitOpenApps}
                      aria-label={t("openApps.aria.command", { index: index + 1 })}
                      data-invalid={!commandValid || undefined}
                    />
                  </label>
                )}
                {target.kind !== "finder" && (
                  <label className="settings-open-app-field settings-open-app-field--args">
                    <span className="settings-visually-hidden">{t("labels.args", { ns: "common" })}</span>
                    <input
                      className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--args"
                      value={target.argsText}
                      placeholder={t("labels.args", { ns: "common" })}
                      onChange={(event) =>
                        onOpenAppDraftChange(index, {
                          argsText: event.target.value,
                        })
                      }
                      onBlur={onCommitOpenApps}
                      aria-label={t("openApps.aria.args", { index: index + 1 })}
                    />
                  </label>
                )}
              </div>
              <div className="settings-open-app-actions">
                {!isComplete && (
                  <span
                    className="settings-open-app-status"
                    title={incompleteHint}
                    aria-label={incompleteHint}
                  >
                    {t("openApps.incomplete.badge")}
                  </span>
                )}
                <label className="settings-open-app-default">
                  <input
                    type="radio"
                    name="open-app-default"
                    checked={target.id === openAppSelectedId}
                    onChange={() => onSelectOpenAppDefault(target.id)}
                    disabled={!isComplete}
                  />
                  {t("labels.default", { ns: "common" })}
                </label>
                <div className="settings-open-app-order">
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => onMoveOpenApp(index, "up")}
                    disabled={index === 0}
                    aria-label={t("actions.moveUp", { ns: "common" })}
                  >
                    <ChevronUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => onMoveOpenApp(index, "down")}
                    disabled={index === openAppDrafts.length - 1}
                    aria-label={t("actions.moveDown", { ns: "common" })}
                  >
                    <ChevronDown aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  className="ghost icon-button"
                  onClick={() => onDeleteOpenApp(index)}
                  disabled={openAppDrafts.length <= 1}
                  aria-label={t("openApps.removeApp")}
                  title={t("openApps.removeApp")}
                >
                  <Trash2 aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="settings-open-app-footer">
        <button type="button" className="ghost" onClick={onAddOpenApp}>
          {t("openApps.addApp")}
        </button>
        <div className="settings-help">
          {t("openApps.commandHelp")}{" "}
          {isMacPlatform()
            ? t("openApps.platformHelp.mac")
            : t("openApps.platformHelp.other")}
        </div>
      </div>
    </SettingsSection>
  );
}
