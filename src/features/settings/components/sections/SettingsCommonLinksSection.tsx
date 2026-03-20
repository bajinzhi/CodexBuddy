import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/features/design-system/components/settings/SettingsPrimitives";
import type { CommonLinkDraft } from "@settings/components/settingsTypes";
import {
  isCommonLinkDraftComplete,
  isCommonLinkUrlValid,
} from "@settings/components/settingsViewHelpers";

type SettingsCommonLinksSectionProps = {
  commonLinkDrafts: CommonLinkDraft[];
  onCommonLinkDraftChange: (index: number, updates: Partial<CommonLinkDraft>) => void;
  onCommitCommonLinks: () => void;
  onMoveCommonLink: (index: number, direction: "up" | "down") => void;
  onDeleteCommonLink: (index: number) => void;
  onAddCommonLink: () => void;
};

export function SettingsCommonLinksSection({
  commonLinkDrafts,
  onCommonLinkDraftChange,
  onCommitCommonLinks,
  onMoveCommonLink,
  onDeleteCommonLink,
  onAddCommonLink,
}: SettingsCommonLinksSectionProps) {
  const { t } = useTranslation(["settings", "common"]);

  const getCommonLinkHint = (link: CommonLinkDraft) => {
    if (!link.label.trim()) {
      return t("commonLinks.labelRequired");
    }
    if (!link.url.trim()) {
      return t("commonLinks.urlRequired");
    }
    if (!isCommonLinkUrlValid(link.url.trim())) {
      return t("commonLinks.invalidUrl");
    }
    return null;
  };

  return (
    <SettingsSection
      title={t("commonLinks.title")}
      subtitle={t("commonLinks.subtitle")}
    >
      <div className="settings-common-links">
        {commonLinkDrafts.map((link, index) => {
          const isComplete = isCommonLinkDraftComplete(link);
          const isUrlValid = !link.url.trim() || isCommonLinkUrlValid(link.url.trim());
          const statusHint = getCommonLinkHint(link);

          return (
            <div
              key={link.id}
              className={`settings-common-link-row${
                statusHint ? " is-incomplete" : ""
              }`}
            >
              <div className="settings-common-link-fields">
                <label className="settings-common-link-field settings-common-link-field--label">
                  <span className="settings-visually-hidden">
                    {t("labels.label", { ns: "common" })}
                  </span>
                  <input
                    className="settings-input settings-input--compact settings-common-link-input settings-common-link-input--label"
                    value={link.label}
                    placeholder={t("labels.label", { ns: "common" })}
                    onChange={(event) =>
                      onCommonLinkDraftChange(index, {
                        label: event.target.value,
                      })
                    }
                    onBlur={onCommitCommonLinks}
                    aria-label={t("commonLinks.labelAria", { index: index + 1 })}
                    data-invalid={!link.label.trim() || undefined}
                  />
                </label>
                <label className="settings-common-link-field settings-common-link-field--url">
                  <span className="settings-visually-hidden">
                    {t("labels.url", { ns: "common" })}
                  </span>
                  <input
                    className="settings-input settings-input--compact settings-common-link-input settings-common-link-input--url"
                    value={link.url}
                    placeholder={t("labels.url", { ns: "common" })}
                    onChange={(event) =>
                      onCommonLinkDraftChange(index, {
                        url: event.target.value,
                      })
                    }
                    onBlur={onCommitCommonLinks}
                    aria-label={t("commonLinks.urlAria", { index: index + 1 })}
                    data-invalid={(!isComplete || !isUrlValid) ? true : undefined}
                  />
                </label>
              </div>
              <div className="settings-common-link-actions">
                {statusHint && (
                  <span
                    className="settings-common-link-status"
                    title={statusHint}
                    aria-label={statusHint}
                  >
                    {t("commonLinks.invalid")}
                  </span>
                )}
                <div className="settings-common-link-order">
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => onMoveCommonLink(index, "up")}
                    disabled={index === 0}
                    aria-label={t("actions.moveUp", { ns: "common" })}
                  >
                    <ChevronUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => onMoveCommonLink(index, "down")}
                    disabled={index === commonLinkDrafts.length - 1}
                    aria-label={t("actions.moveDown", { ns: "common" })}
                  >
                    <ChevronDown aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  className="ghost icon-button"
                  onClick={() => onDeleteCommonLink(index)}
                  aria-label={t("commonLinks.removeLink")}
                  title={t("commonLinks.removeLink")}
                >
                  <Trash2 aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="settings-common-link-footer">
        <button type="button" className="ghost" onClick={onAddCommonLink}>
          {t("commonLinks.addLink")}
        </button>
        <div className="settings-help">
          {t("commonLinks.help")}
        </div>
      </div>
    </SettingsSection>
  );
}
