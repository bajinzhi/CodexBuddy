import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "../../design-system/components/modal/ModalShell";

type RenameThreadPromptProps = {
  currentName: string;
  name: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RenameThreadPrompt({
  currentName,
  name,
  onChange,
  onCancel,
  onConfirm,
}: RenameThreadPromptProps) {
  const { t } = useTranslation(["app", "common"]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <ModalShell
      className="worktree-modal"
      onBackdropClick={onCancel}
      ariaLabel={t("renameThreadPrompt.ariaLabel", { ns: "app" })}
    >
      <div className="ds-modal-title worktree-modal-title">
        {t("renameThreadPrompt.title", { ns: "app" })}
      </div>
      <div className="ds-modal-subtitle worktree-modal-subtitle">
        {t("renameThreadPrompt.currentName", { ns: "app", name: currentName })}
      </div>
      <label className="ds-modal-label worktree-modal-label" htmlFor="thread-rename">
        {t("renameThreadPrompt.newName", { ns: "app" })}
      </label>
      <input
        id="thread-rename"
        ref={inputRef}
        className="ds-modal-input worktree-modal-input"
        value={name}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (event.key === "Enter") {
            event.preventDefault();
            onConfirm();
          }
        }}
      />
      <div className="ds-modal-actions worktree-modal-actions">
        <button
          className="ghost ds-modal-button worktree-modal-button"
          onClick={onCancel}
          type="button"
        >
          {t("common:actions.cancel")}
        </button>
        <button
          className="primary ds-modal-button worktree-modal-button"
          onClick={onConfirm}
          type="button"
          disabled={name.trim().length === 0}
        >
          {t("common:actions.rename")}
        </button>
      </div>
    </ModalShell>
  );
}
