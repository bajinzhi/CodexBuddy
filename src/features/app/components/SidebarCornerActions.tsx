import type { CommonLink } from "@/types";
import { isCommonLinkTargetUsable } from "@settings/components/settingsViewHelpers";
import { openUrl } from "@tauri-apps/plugin-opener";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Link2 from "lucide-react/dist/esm/icons/link-2";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Settings from "lucide-react/dist/esm/icons/settings";
import User from "lucide-react/dist/esm/icons/user";
import X from "lucide-react/dist/esm/icons/x";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  MenuTrigger,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../hooks/useMenuController";

type SidebarCornerActionsProps = {
  commonLinks: CommonLink[];
  onOpenSettings: (section?: "common-links") => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  showAccountSwitcher: boolean;
  accountLabel: string;
  accountActionLabel: string;
  accountDisabled: boolean;
  accountSwitching: boolean;
  accountCancelDisabled: boolean;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
};

export function SidebarCornerActions({
  commonLinks,
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  showAccountSwitcher,
  accountLabel,
  accountActionLabel,
  accountDisabled,
  accountSwitching,
  accountCancelDisabled,
  onSwitchAccount,
  onCancelSwitchAccount,
}: SidebarCornerActionsProps) {
  const { t } = useTranslation("app");
  const accountMenu = useMenuController();
  const commonLinksMenu = useMenuController();
  const {
    isOpen: accountMenuOpen,
    containerRef: accountMenuRef,
    close: closeAccountMenu,
    toggle: toggleAccountMenu,
  } = accountMenu;
  const {
    isOpen: commonLinksMenuOpen,
    containerRef: commonLinksMenuRef,
    close: closeCommonLinksMenu,
    toggle: toggleCommonLinksMenu,
  } = commonLinksMenu;
  const usableCommonLinks = useMemo(
    () => commonLinks.filter(isCommonLinkTargetUsable),
    [commonLinks],
  );

  useEffect(() => {
    if (!showAccountSwitcher) {
      closeAccountMenu();
    }
  }, [closeAccountMenu, showAccountSwitcher]);

  const handleOpenCommonLink = (url: string) => {
    closeCommonLinksMenu();
    void openUrl(url);
  };

  const handleManageCommonLinks = () => {
    closeCommonLinksMenu();
    onOpenSettings("common-links");
  };
  const commonLinksTitle = t("commonLinks.title");
  const commonLinksEmpty = t("commonLinks.empty");
  const commonLinksAction =
    usableCommonLinks.length > 0 ? t("commonLinks.manage") : t("commonLinks.add");

  return (
    <div className="sidebar-corner-actions">
      {showAccountSwitcher && (
        <div className="sidebar-account-menu" ref={accountMenuRef}>
          <MenuTrigger
            isOpen={accountMenuOpen}
            popupRole="dialog"
            className="ghost sidebar-corner-button ds-tooltip-trigger"
            onClick={toggleAccountMenu}
            aria-label={t("sidebar.account.title")}
            title={t("sidebar.account.title")}
            data-tooltip={t("sidebar.account.title")}
            data-tooltip-align="start"
          >
            <User size={14} aria-hidden />
          </MenuTrigger>
          {accountMenuOpen && (
            <PopoverSurface className="sidebar-account-popover" role="dialog">
              <div className="sidebar-account-title">{t("sidebar.account.title")}</div>
              <div className="sidebar-account-value">{accountLabel}</div>
              <div className="sidebar-account-actions-row">
                <button
                  type="button"
                  className="primary sidebar-account-action"
                  onClick={onSwitchAccount}
                  disabled={accountDisabled}
                  aria-busy={accountSwitching}
                >
                  <span className="sidebar-account-action-content">
                    {accountSwitching && (
                      <span className="sidebar-account-spinner" aria-hidden />
                    )}
                    <span>{accountActionLabel}</span>
                  </span>
                </button>
                {accountSwitching && (
                  <button
                    type="button"
                    className="secondary sidebar-account-cancel"
                    onClick={onCancelSwitchAccount}
                    disabled={accountCancelDisabled}
                    aria-label={t("sidebar.account.cancelSwitch")}
                    title={t("actions.cancel", { ns: "common" })}
                  >
                    <X size={12} aria-hidden />
                  </button>
                )}
              </div>
            </PopoverSurface>
          )}
        </div>
      )}
      <button
        className="ghost sidebar-corner-button ds-tooltip-trigger"
        type="button"
        onClick={() => onOpenSettings()}
        aria-label={t("sidebar.openSettings")}
        title={t("sidebar.settings")}
        data-tooltip={t("sidebar.settings")}
        data-tooltip-align="start"
      >
        <Settings size={14} aria-hidden />
      </button>
      <div className="sidebar-common-links-menu" ref={commonLinksMenuRef}>
        <MenuTrigger
          isOpen={commonLinksMenuOpen}
          popupRole="dialog"
          className="ghost sidebar-corner-button ds-tooltip-trigger"
          onClick={toggleCommonLinksMenu}
          aria-label={commonLinksTitle}
          title={commonLinksTitle}
          data-tooltip={commonLinksTitle}
          data-tooltip-align="start"
        >
          <Link2 size={14} aria-hidden />
        </MenuTrigger>
        {commonLinksMenuOpen && (
          <PopoverSurface className="sidebar-common-links-popover" role="dialog">
            <div className="sidebar-common-links-title">{commonLinksTitle}</div>
            {usableCommonLinks.length > 0 ? (
              <div className="sidebar-common-links-list">
                {usableCommonLinks.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    className="ghost sidebar-common-link-item"
                    onClick={() => handleOpenCommonLink(link.url)}
                    aria-label={t("commonLinks.open", { label: link.label })}
                    title={link.url}
                  >
                    <span className="sidebar-common-link-copy">
                      <span className="sidebar-common-link-label">{link.label}</span>
                      <span className="sidebar-common-link-url">{link.url}</span>
                    </span>
                    <ExternalLink size={12} aria-hidden />
                  </button>
                ))}
              </div>
            ) : (
              <div className="sidebar-common-links-empty">
                {commonLinksEmpty}
              </div>
            )}
            <button
              type="button"
              className="secondary sidebar-common-links-manage"
              onClick={handleManageCommonLinks}
            >
              {commonLinksAction}
            </button>
          </PopoverSurface>
        )}
      </div>
      {showDebugButton && (
        <button
          className="ghost sidebar-corner-button ds-tooltip-trigger"
          type="button"
          onClick={onOpenDebug}
          aria-label={t("sidebar.openDebugLog")}
          title={t("sidebar.debugLog")}
          data-tooltip={t("sidebar.debugLog")}
          data-tooltip-align="start"
        >
          <ScrollText size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
