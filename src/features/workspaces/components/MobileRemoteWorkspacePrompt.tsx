import { useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ModalShell } from "../../design-system/components/modal/ModalShell";

type MobileRemoteWorkspacePromptProps = {
  value: string;
  error: string | null;
  recentPaths: string[];
  onChange: (value: string) => void;
  onRecentPathSelect: (path: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MobileRemoteWorkspacePrompt({
  value,
  error,
  recentPaths,
  onChange,
  onRecentPathSelect,
  onCancel,
  onConfirm,
}: MobileRemoteWorkspacePromptProps) {
  const { t } = useTranslation(["app", "common"]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusTextareaAtEnd = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  };

  useEffect(() => {
    focusTextareaAtEnd();
  }, []);

  return (
    <ModalShell
      ariaLabel={t("workspaces.mobileRemotePrompt.ariaLabel", { ns: "app" })}
      className="mobile-remote-workspace-modal"
      cardClassName="mobile-remote-workspace-modal-card"
      onBackdropClick={onCancel}
    >
      <div className="mobile-remote-workspace-modal-content">
        <div className="ds-modal-title">
          {t("workspaces.mobileRemotePrompt.title", { ns: "app" })}
        </div>
        <div className="ds-modal-subtitle">
          {t("workspaces.mobileRemotePrompt.subtitle", { ns: "app" })}
        </div>
        <label className="ds-modal-label" htmlFor="mobile-remote-workspace-paths">
          {t("workspaces.mobileRemotePrompt.pathsLabel", { ns: "app" })}
        </label>
        <textarea
          id="mobile-remote-workspace-paths"
          ref={textareaRef}
          className="ds-modal-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("workspaces.mobileRemotePrompt.pathsPlaceholder", {
            ns: "app",
          })}
          rows={4}
          wrap="off"
        />
        <div className="mobile-remote-workspace-modal-hint">
          <Trans
            t={t}
            ns="app"
            i18nKey="workspaces.mobileRemotePrompt.hint"
            components={{ code: <code /> }}
          />
        </div>
        {recentPaths.length > 0 && (
          <div className="mobile-remote-workspace-modal-recent">
            <div className="mobile-remote-workspace-modal-recent-title">
              {t("workspaces.mobileRemotePrompt.recentlyAdded", { ns: "app" })}
            </div>
            <div className="mobile-remote-workspace-modal-recent-list">
              {recentPaths.map((path) => (
                <button
                  key={path}
                  type="button"
                  className="mobile-remote-workspace-modal-recent-item"
                  onClick={() => {
                    onRecentPathSelect(path);
                    requestAnimationFrame(() => {
                      focusTextareaAtEnd();
                    });
                  }}
                >
                  {path}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <div className="ds-modal-error">{error}</div>}
        <div className="ds-modal-actions">
          <button className="ghost ds-modal-button" onClick={onCancel} type="button">
            {t("actions.cancel", { ns: "common" })}
          </button>
          <button className="primary ds-modal-button" onClick={onConfirm} type="button">
            {t("actions.add", { ns: "common" })}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
