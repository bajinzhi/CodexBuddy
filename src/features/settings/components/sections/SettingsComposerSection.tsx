import type { AppSettings } from "@/types";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { getQuickCommandLabel } from "@/utils/quickCommands";

type ComposerPreset = AppSettings["composerEditorPreset"];

type SettingsComposerSectionProps = {
  appSettings: AppSettings;
  quickCommandDrafts: AppSettings["quickCommands"];
  optionKeyLabel: string;
  followUpShortcutLabel: string;
  composerPresetLabels: Record<ComposerPreset, string>;
  onComposerPresetChange: (preset: ComposerPreset) => void;
  onQuickCommandDraftChange: (
    id: string,
    updates: Partial<AppSettings["quickCommands"][number]>,
  ) => void;
  onCommitQuickCommands: () => void;
  onAddQuickCommand: () => void;
  onDeleteQuickCommand: (id: string) => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsComposerSection({
  appSettings,
  quickCommandDrafts,
  optionKeyLabel,
  followUpShortcutLabel,
  composerPresetLabels,
  onComposerPresetChange,
  onQuickCommandDraftChange,
  onCommitQuickCommands,
  onAddQuickCommand,
  onDeleteQuickCommand,
  onUpdateAppSettings,
}: SettingsComposerSectionProps) {
  const steerUnavailable = !appSettings.steerEnabled;

  return (
    <SettingsSection
      title="Composer"
      subtitle="Control helpers and formatting behavior inside the message editor."
    >
      <div className="settings-field">
        <div className="settings-field-label">Follow-up behavior</div>
        <div className={`settings-segmented${appSettings.followUpMessageBehavior === "steer" ? " is-second-active" : ""}`} aria-label="Follow-up behavior">
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
            <span className="settings-segmented-option-label">Queue</span>
          </label>
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "steer" ? " is-active" : ""
            }${steerUnavailable ? " is-disabled" : ""}`}
            title={steerUnavailable ? "Steer is unavailable in the current Codex config." : ""}
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
            <span className="settings-segmented-option-label">Steer</span>
          </label>
        </div>
        <div className="settings-help">
          Choose the default while a run is active. Press {followUpShortcutLabel} to send the
          opposite behavior for one message.
        </div>
        <SettingsToggleRow
          title="Show follow-up hint while processing"
          subtitle="Displays queue/steer shortcut guidance above the composer."
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
          <div className="settings-help">
            Steer is unavailable in the current Codex config. Follow-ups will queue.
          </div>
        )}
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">Quick commands</div>
      <div className="settings-subsection-subtitle">
        Add reusable prompts that can be inserted from the composer toolbar.
      </div>
      <div className="settings-field">
        {quickCommandDrafts.length > 0 ? (
          <div className="settings-quick-command-list">
            {quickCommandDrafts.map((command) => (
              <div key={command.id} className="settings-quick-command-row">
                <div className="settings-quick-command-fields">
                  <input
                    className="settings-input settings-input--compact"
                    value={command.label}
                    placeholder={getQuickCommandLabel(command)}
                    onChange={(event) =>
                      onQuickCommandDraftChange(command.id, {
                        label: event.target.value,
                      })
                    }
                    onBlur={onCommitQuickCommands}
                    aria-label="Quick command label"
                  />
                  <textarea
                    className="settings-agents-textarea settings-agents-textarea--compact"
                    value={command.text}
                    placeholder="Enter the prompt inserted into the composer"
                    onChange={(event) =>
                      onQuickCommandDraftChange(command.id, {
                        text: event.target.value,
                      })
                    }
                    onBlur={onCommitQuickCommands}
                    rows={3}
                    aria-label="Quick command text"
                  />
                </div>
                <button
                  type="button"
                  className="ghost icon-button"
                  onClick={() => onDeleteQuickCommand(command.id)}
                  aria-label="Delete quick command"
                  title="Delete quick command"
                >
                  <Trash2 aria-hidden />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="settings-empty">No quick commands yet.</div>
        )}
        <div className="settings-field-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={onAddQuickCommand}
          >
            Add quick command
          </button>
        </div>
        <div className="settings-help">
          The toolbar button inserts the command at the current cursor position instead of sending
          it immediately.
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">Presets</div>
      <div className="settings-subsection-subtitle">
        Choose a starting point and fine-tune the toggles below.
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          Preset
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
              {label}
            </option>
          ))}
        </select>
        <div className="settings-help">
          Presets update the toggles below. Customize any setting after selecting.
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">Code fences</div>
      <SettingsToggleRow
        title="Expand fences on Space"
        subtitle="Typing ``` then Space inserts a fenced block."
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
        title="Expand fences on Enter"
        subtitle="Use Enter to expand ``` lines when enabled."
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
        title="Support language tags"
        subtitle="Allows ```lang + Space to include a language."
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
        title="Wrap selection in fences"
        subtitle="Wraps selected text when creating a fence."
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
        title="Copy blocks without fences"
        subtitle={
          <>
            When enabled, Copy is plain text. Hold {optionKeyLabel} to include ``` fences.
          </>
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
      <div className="settings-subsection-title">Pasting</div>
      <SettingsToggleRow
        title="Auto-wrap multi-line paste"
        subtitle="Wraps multi-line paste inside a fenced block."
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
        title="Auto-wrap code-like single lines"
        subtitle="Wraps long single-line code snippets on paste."
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
      <div className="settings-subsection-title">Lists</div>
      <SettingsToggleRow
        title="Continue lists on Shift+Enter"
        subtitle="Continues numbered and bulleted lists when the line has content."
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
