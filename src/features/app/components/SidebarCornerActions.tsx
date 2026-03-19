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

  return (
    <div className="sidebar-corner-actions">
      {showAccountSwitcher && (
        <div className="sidebar-account-menu" ref={accountMenuRef}>
          <MenuTrigger
            isOpen={accountMenuOpen}
            popupRole="dialog"
            className="ghost sidebar-corner-button ds-tooltip-trigger"
            onClick={toggleAccountMenu}
            aria-label="Account"
            title="Account"
            data-tooltip="Account"
            data-tooltip-align="start"
          >
            <User size={14} aria-hidden />
          </MenuTrigger>
          {accountMenuOpen && (
            <PopoverSurface className="sidebar-account-popover" role="dialog">
              <div className="sidebar-account-title">Account</div>
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
                    aria-label="Cancel account switch"
                    title="Cancel"
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
        aria-label="Open settings"
        title="Settings"
        data-tooltip="Settings"
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
          aria-label="Common links"
          title="Common links"
          data-tooltip="Common links"
          data-tooltip-align="start"
        >
          <Link2 size={14} aria-hidden />
        </MenuTrigger>
        {commonLinksMenuOpen && (
          <PopoverSurface className="sidebar-common-links-popover" role="dialog">
            <div className="sidebar-common-links-title">Common links</div>
            {usableCommonLinks.length > 0 ? (
              <div className="sidebar-common-links-list">
                {usableCommonLinks.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    className="ghost sidebar-common-link-item"
                    onClick={() => handleOpenCommonLink(link.url)}
                    aria-label={`Open ${link.label}`}
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
                No common links yet.
              </div>
            )}
            <button
              type="button"
              className="secondary sidebar-common-links-manage"
              onClick={handleManageCommonLinks}
            >
              {usableCommonLinks.length > 0 ? "Manage links" : "Add links"}
            </button>
          </PopoverSurface>
        )}
      </div>
      {showDebugButton && (
        <button
          className="ghost sidebar-corner-button ds-tooltip-trigger"
          type="button"
          onClick={onOpenDebug}
          aria-label="Open debug log"
          title="Debug log"
          data-tooltip="Debug log"
          data-tooltip-align="start"
        >
          <ScrollText size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
