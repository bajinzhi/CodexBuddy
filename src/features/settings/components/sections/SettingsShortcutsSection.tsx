import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  SettingsSection,
  SettingsSubsection,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { formatShortcut, getDefaultInterruptShortcut } from "@utils/shortcuts";
import { isMacPlatform } from "@utils/platformPaths";
import type {
  ShortcutDraftKey,
  ShortcutDrafts,
  ShortcutSettingKey,
} from "@settings/components/settingsTypes";

type ShortcutItem = {
  label: string;
  draftKey: ShortcutDraftKey;
  settingKey: ShortcutSettingKey;
  help: string;
};

type ShortcutGroup = {
  title: string;
  subtitle: string;
  items: ShortcutItem[];
};

type SettingsShortcutsSectionProps = {
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
};

function ShortcutField({
  item,
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
  clearLabel,
  inputPlaceholder,
}: {
  item: ShortcutItem;
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
  clearLabel: string;
  inputPlaceholder: string;
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">{item.label}</div>
      <div className="settings-field-row">
        <input
          className="settings-input settings-input--shortcut"
          value={formatShortcut(shortcutDrafts[item.draftKey])}
          onKeyDown={(event) => onShortcutKeyDown(event, item.settingKey)}
          placeholder={inputPlaceholder}
          readOnly
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => onClearShortcut(item.settingKey)}
        >
          {clearLabel}
        </button>
      </div>
      <div className="settings-help">{item.help}</div>
    </div>
  );
}

export function SettingsShortcutsSection({
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
}: SettingsShortcutsSectionProps) {
  const { t } = useTranslation(["settings", "common"]);
  const isMac = isMacPlatform();
  const [searchQuery, setSearchQuery] = useState("");

  const groups = useMemo<ShortcutGroup[]>(
    () => [
      {
        title: t("shortcuts.groups.file.title"),
        subtitle: t("shortcuts.groups.file.subtitle"),
        items: [
          {
            label: t("shortcuts.items.newAgent.label"),
            draftKey: "newAgent",
            settingKey: "newAgentShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("cmd+n") }),
          },
          {
            label: t("shortcuts.items.newWorktreeAgent.label"),
            draftKey: "newWorktreeAgent",
            settingKey: "newWorktreeAgentShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("cmd+shift+n") }),
          },
          {
            label: t("shortcuts.items.newCloneAgent.label"),
            draftKey: "newCloneAgent",
            settingKey: "newCloneAgentShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("cmd+alt+n") }),
          },
          {
            label: t("shortcuts.items.archiveThread.label"),
            draftKey: "archiveThread",
            settingKey: "archiveThreadShortcut",
            help: t("shortcuts.defaultHelp", {
              shortcut: formatShortcut(isMac ? "cmd+ctrl+a" : "ctrl+alt+a"),
            }),
          },
        ],
      },
      {
        title: t("shortcuts.groups.composer.title"),
        subtitle: t("shortcuts.groups.composer.subtitle"),
        items: [
          {
            label: t("shortcuts.items.cycleModel.label"),
            draftKey: "model",
            settingKey: "composerModelShortcut",
            help: t("shortcuts.pressNewHelp", {
              shortcut: formatShortcut("cmd+shift+m"),
            }),
          },
          {
            label: t("shortcuts.items.cycleAccess.label"),
            draftKey: "access",
            settingKey: "composerAccessShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("cmd+shift+a") }),
          },
          {
            label: t("shortcuts.items.cycleReasoning.label"),
            draftKey: "reasoning",
            settingKey: "composerReasoningShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("cmd+shift+r") }),
          },
          {
            label: t("shortcuts.items.cycleCollaboration.label"),
            draftKey: "collaboration",
            settingKey: "composerCollaborationShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("shift+tab") }),
          },
          {
            label: t("shortcuts.items.stopRun.label"),
            draftKey: "interrupt",
            settingKey: "interruptShortcut",
            help: t("shortcuts.defaultHelp", {
              shortcut: formatShortcut(getDefaultInterruptShortcut()),
            }),
          },
        ],
      },
      {
        title: t("shortcuts.groups.panels.title"),
        subtitle: t("shortcuts.groups.panels.subtitle"),
        items: [
          {
            label: t("shortcuts.items.toggleProjectsSidebar.label"),
            draftKey: "projectsSidebar",
            settingKey: "toggleProjectsSidebarShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("cmd+shift+p") }),
          },
          {
            label: t("shortcuts.items.toggleGitSidebar.label"),
            draftKey: "gitSidebar",
            settingKey: "toggleGitSidebarShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("cmd+shift+g") }),
          },
          {
            label: t("shortcuts.items.branchSwitcher.label"),
            draftKey: "branchSwitcher",
            settingKey: "branchSwitcherShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("cmd+b") }),
          },
          {
            label: t("shortcuts.items.toggleDebugPanel.label"),
            draftKey: "debugPanel",
            settingKey: "toggleDebugPanelShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("cmd+shift+d") }),
          },
          {
            label: t("shortcuts.items.toggleTerminal.label"),
            draftKey: "terminal",
            settingKey: "toggleTerminalShortcut",
            help: t("shortcuts.defaultHelp", { shortcut: formatShortcut("cmd+shift+t") }),
          },
        ],
      },
      {
        title: t("shortcuts.groups.navigation.title"),
        subtitle: t("shortcuts.groups.navigation.subtitle"),
        items: [
          {
            label: t("shortcuts.items.nextAgent.label"),
            draftKey: "cycleAgentNext",
            settingKey: "cycleAgentNextShortcut",
            help: t("shortcuts.defaultHelp", {
              shortcut: formatShortcut(isMac ? "cmd+ctrl+down" : "ctrl+alt+down"),
            }),
          },
          {
            label: t("shortcuts.items.previousAgent.label"),
            draftKey: "cycleAgentPrev",
            settingKey: "cycleAgentPrevShortcut",
            help: t("shortcuts.defaultHelp", {
              shortcut: formatShortcut(isMac ? "cmd+ctrl+up" : "ctrl+alt+up"),
            }),
          },
          {
            label: t("shortcuts.items.nextWorkspace.label"),
            draftKey: "cycleWorkspaceNext",
            settingKey: "cycleWorkspaceNextShortcut",
            help: t("shortcuts.defaultHelp", {
              shortcut: formatShortcut(
                isMac ? "cmd+shift+down" : "ctrl+alt+shift+down",
              ),
            }),
          },
          {
            label: t("shortcuts.items.previousWorkspace.label"),
            draftKey: "cycleWorkspacePrev",
            settingKey: "cycleWorkspacePrevShortcut",
            help: t("shortcuts.defaultHelp", {
              shortcut: formatShortcut(isMac ? "cmd+shift+up" : "ctrl+alt+shift+up"),
            }),
          },
        ],
      },
    ],
    [isMac, t],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedSearchQuery) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const searchValue = `${group.title} ${group.subtitle} ${item.label} ${item.help}`.toLowerCase();
          return searchValue.includes(normalizedSearchQuery);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedSearchQuery]);

  return (
    <SettingsSection
      title={t("shortcuts.title")}
      subtitle={t("shortcuts.subtitle")}
    >
      <div className="settings-field settings-shortcuts-search">
        <label className="settings-field-label" htmlFor="settings-shortcuts-search">
          {t("shortcuts.searchLabel")}
        </label>
        <div className="settings-field-row">
          <input
            id="settings-shortcuts-search"
            className="settings-input"
            placeholder={t("shortcuts.searchPlaceholder")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="ghost settings-button-compact"
              onClick={() => setSearchQuery("")}
            >
              {t("actions.clear", { ns: "common" })}
            </button>
          )}
        </div>
        <div className="settings-help">{t("shortcuts.searchHelp")}</div>
      </div>
      {filteredGroups.map((group, index) => (
        <div key={group.title}>
          {index > 0 && <div className="settings-divider" />}
          <SettingsSubsection title={group.title} subtitle={group.subtitle} />
          {group.items.map((item) => (
            <ShortcutField
              key={item.settingKey}
              item={item}
              shortcutDrafts={shortcutDrafts}
              onShortcutKeyDown={onShortcutKeyDown}
              onClearShortcut={onClearShortcut}
              clearLabel={t("actions.clear", { ns: "common" })}
              inputPlaceholder={t("shortcuts.typeShortcut")}
            />
          ))}
        </div>
      ))}
      {filteredGroups.length === 0 && (
        <div className="settings-empty">
          {t("shortcuts.noMatch", {
            query: normalizedSearchQuery ? searchQuery.trim() : t("shortcuts.yourSearch"),
          })}
        </div>
      )}
    </SettingsSection>
  );
}
