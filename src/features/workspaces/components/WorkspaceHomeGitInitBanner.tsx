import { useTranslation } from "react-i18next";

type WorkspaceHomeGitInitBannerProps = {
  isLoading: boolean;
  onInitGitRepo: () => void | Promise<void>;
};

export function WorkspaceHomeGitInitBanner({
  isLoading,
  onInitGitRepo,
}: WorkspaceHomeGitInitBannerProps) {
  const { t } = useTranslation(["app", "common"]);
  return (
    <div
      className="workspace-home-git-banner"
      role="region"
      aria-label={t("workspaceHome.git.setup")}
    >
      <div className="workspace-home-git-banner-title">
        {t("workspaceHome.git.notInitialized")}
      </div>
      <div className="workspace-home-git-banner-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void onInitGitRepo()}
          disabled={isLoading}
        >
          {isLoading ? t("common:status.initializing") : t("workspaceHome.git.initialize")}
        </button>
      </div>
    </div>
  );
}

