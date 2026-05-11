import { useTranslation } from "react-i18next";
import type { SettingsDisplaySectionProps } from "@settings/hooks/useSettingsDisplaySection";
import { SettingsSection } from "@/features/design-system/components/settings/SettingsPrimitives";
import { SettingsPetControls } from "./SettingsPetControls";

type SettingsPetsSectionProps = Pick<
  SettingsDisplaySectionProps,
  "appSettings" | "onUpdateAppSettings"
>;

export function SettingsPetsSection({
  appSettings,
  onUpdateAppSettings,
}: SettingsPetsSectionProps) {
  const { t } = useTranslation("settings");

  return (
    <SettingsSection title={t("pets.title")} subtitle={t("pets.subtitle")}>
      <SettingsPetControls
        appSettings={appSettings}
        onUpdateAppSettings={onUpdateAppSettings}
        showHeading={false}
      />
    </SettingsSection>
  );
}
