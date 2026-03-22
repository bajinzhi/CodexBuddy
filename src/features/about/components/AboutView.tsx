import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";

const GITHUB_URL = "https://github.com/bajinzhi/CodexBuddy";
const TWITTER_URL = "https://x.com/bajinzhi";

export function AboutView() {
  const { t } = useTranslation(["app", "common"]);
  const [version, setVersion] = useState<string | null>(null);

  const handleOpenGitHub = () => {
    void openUrl(GITHUB_URL);
  };

  const handleOpenTwitter = () => {
    void openUrl(TWITTER_URL);
  };

  useEffect(() => {
    let active = true;
    const fetchVersion = async () => {
      try {
        const value = await getVersion();
        if (active) {
          setVersion(value);
        }
      } catch {
        if (active) {
          setVersion(null);
        }
      }
    };

    void fetchVersion();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="about">
      <div className="about-card">
        <div className="about-header">
          <img
            className="about-icon"
            src="/app-icon.png"
            alt={t("about.iconAlt", { ns: "app" })}
          />
          <div className="about-title">{t("common:appName")}</div>
        </div>
        <div className="about-version">
          {version ? t("about.version", { ns: "app", version }) : t("about.versionFallback", { ns: "app" })}
        </div>
        <div className="about-tagline">
          {t("about.tagline", { ns: "app" })}
        </div>
        <div className="about-divider" />
        <div className="about-links">
          <button
            type="button"
            className="about-link"
            onClick={handleOpenGitHub}
          >
            {t("about.github", { ns: "app" })}
          </button>
          <span className="about-link-sep">|</span>
          <button
            type="button"
            className="about-link"
            onClick={handleOpenTwitter}
          >
            {t("about.twitter", { ns: "app" })}
          </button>
        </div>
        <div className="about-footer">{t("about.footer", { ns: "app" })}</div>
      </div>
    </div>
  );
}
