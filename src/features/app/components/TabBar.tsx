import type { ReactNode } from "react";
import FolderKanban from "lucide-react/dist/esm/icons/folder-kanban";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import House from "lucide-react/dist/esm/icons/house";
import MessagesSquare from "lucide-react/dist/esm/icons/messages-square";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import { useTranslation } from "react-i18next";

type TabKey = "home" | "projects" | "codex" | "git" | "log";

type TabBarProps = {
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
};

const tabs: { id: TabKey; label: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", icon: <House className="tabbar-icon" /> },
  { id: "projects", label: "Projects", icon: <FolderKanban className="tabbar-icon" /> },
  { id: "codex", label: "Codex", icon: <MessagesSquare className="tabbar-icon" /> },
  { id: "git", label: "Git", icon: <GitBranch className="tabbar-icon" /> },
  { id: "log", label: "Log", icon: <TerminalSquare className="tabbar-icon" /> },
];

export function TabBar({ activeTab, onSelect }: TabBarProps) {
  const { t } = useTranslation("app");
  return (
    <nav className="tabbar" aria-label={t("tabBar.primaryAria", { ns: "app" })}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tabbar-item ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => onSelect(tab.id)}
          aria-current={activeTab === tab.id ? "page" : undefined}
        >
          {tab.icon}
          <span className="tabbar-label">{t(`tabBar.${tab.id}`, { ns: "app" })}</span>
        </button>
      ))}
    </nav>
  );
}
