import "../../../styles/mobile-setup-wizard.css";
import X from "lucide-react/dist/esm/icons/x";
import { useTranslation } from "react-i18next";
import { ModalShell } from "../../design-system/components/modal/ModalShell";

export type MobileServerSetupWizardProps = {
  remoteHostDraft: string;
  remoteTokenDraft: string;
  busy: boolean;
  checking: boolean;
  statusMessage: string | null;
  statusError: boolean;
  onClose: () => void;
  onRemoteHostChange: (value: string) => void;
  onRemoteTokenChange: (value: string) => void;
  onConnectTest: () => void;
};

export function MobileServerSetupWizard({
  remoteHostDraft,
  remoteTokenDraft,
  busy,
  checking,
  statusMessage,
  statusError,
  onClose,
  onRemoteHostChange,
  onRemoteTokenChange,
  onConnectTest,
}: MobileServerSetupWizardProps) {
  const { t } = useTranslation("app");
  return (
    <ModalShell
      className="mobile-setup-wizard-overlay"
      cardClassName="mobile-setup-wizard-card"
      onBackdropClick={onClose}
      ariaLabel={t("mobileSetup.ariaLabel")}
    >
      <div className="mobile-setup-wizard-header">
        <button
          type="button"
          className="ghost icon-button mobile-setup-wizard-close"
          onClick={onClose}
          aria-label={t("mobileSetup.closeAria")}
        >
          <X aria-hidden />
        </button>
        <div className="mobile-setup-wizard-kicker">{t("mobileSetup.kicker")}</div>
        <h2 className="mobile-setup-wizard-title">{t("mobileSetup.title")}</h2>
        <p className="mobile-setup-wizard-subtitle">
          {t("mobileSetup.subtitle")}
        </p>
      </div>

      <div className="mobile-setup-wizard-body">
        <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-host">
          {t("mobileSetup.hostLabel")}
        </label>
        <input
          id="mobile-setup-host"
          className="mobile-setup-wizard-input"
          value={remoteHostDraft}
          placeholder={t("mobileSetup.hostPlaceholder")}
          onChange={(event) => onRemoteHostChange(event.target.value)}
          disabled={busy || checking}
        />

        <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-token">
          {t("mobileSetup.tokenLabel")}
        </label>
        <input
          id="mobile-setup-token"
          type="password"
          className="mobile-setup-wizard-input"
          value={remoteTokenDraft}
          placeholder={t("mobileSetup.tokenPlaceholder")}
          onChange={(event) => onRemoteTokenChange(event.target.value)}
          disabled={busy || checking}
        />

        <button
          type="button"
          className="button primary mobile-setup-wizard-action"
          onClick={onConnectTest}
          disabled={busy || checking}
        >
          {checking
            ? t("mobileSetup.checking")
            : busy
              ? t("mobileSetup.connecting")
              : t("mobileSetup.connectAndTest")}
        </button>

        {statusMessage ? (
          <div
            className={`mobile-setup-wizard-status${
              statusError ? " mobile-setup-wizard-status-error" : ""
            }`}
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </div>
        ) : null}

        <div className="mobile-setup-wizard-hint">
          {t("mobileSetup.hint")}
        </div>
      </div>
    </ModalShell>
  );
}
