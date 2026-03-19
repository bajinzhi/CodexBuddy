import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
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

const getCommonLinkHint = (link: CommonLinkDraft) => {
  if (!link.label.trim()) {
    return "Label required";
  }
  if (!link.url.trim()) {
    return "URL required";
  }
  if (!isCommonLinkUrlValid(link.url.trim())) {
    return "Use http:// or https://";
  }
  return null;
};

export function SettingsCommonLinksSection({
  commonLinkDrafts,
  onCommonLinkDraftChange,
  onCommitCommonLinks,
  onMoveCommonLink,
  onDeleteCommonLink,
  onAddCommonLink,
}: SettingsCommonLinksSectionProps) {
  return (
    <SettingsSection
      title="Common links"
      subtitle="Manage the quick links shown next to the sidebar settings button."
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
                  <span className="settings-visually-hidden">Label</span>
                  <input
                    className="settings-input settings-input--compact settings-common-link-input settings-common-link-input--label"
                    value={link.label}
                    placeholder="Label"
                    onChange={(event) =>
                      onCommonLinkDraftChange(index, {
                        label: event.target.value,
                      })
                    }
                    onBlur={onCommitCommonLinks}
                    aria-label={`Common link label ${index + 1}`}
                    data-invalid={!link.label.trim() || undefined}
                  />
                </label>
                <label className="settings-common-link-field settings-common-link-field--url">
                  <span className="settings-visually-hidden">URL</span>
                  <input
                    className="settings-input settings-input--compact settings-common-link-input settings-common-link-input--url"
                    value={link.url}
                    placeholder="https://example.com"
                    onChange={(event) =>
                      onCommonLinkDraftChange(index, {
                        url: event.target.value,
                      })
                    }
                    onBlur={onCommitCommonLinks}
                    aria-label={`Common link URL ${index + 1}`}
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
                    Invalid
                  </span>
                )}
                <div className="settings-common-link-order">
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => onMoveCommonLink(index, "up")}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    <ChevronUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => onMoveCommonLink(index, "down")}
                    disabled={index === commonLinkDrafts.length - 1}
                    aria-label="Move down"
                  >
                    <ChevronDown aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  className="ghost icon-button"
                  onClick={() => onDeleteCommonLink(index)}
                  aria-label="Remove link"
                  title="Remove link"
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
          Add link
        </button>
        <div className="settings-help">
          Links appear in the sidebar popover after both label and URL are valid.
        </div>
      </div>
    </SettingsSection>
  );
}
