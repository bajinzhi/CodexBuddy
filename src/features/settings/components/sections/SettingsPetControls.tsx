import { useTranslation } from "react-i18next";
import type { AppSettings } from "@/types";
import {
  SettingsSubsection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { BUILTIN_PET_ID } from "@/features/pets/builtinPets";
import { useAvailablePets } from "@/features/pets/hooks/useAvailablePets";

type SettingsPetControlsProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  showHeading?: boolean;
};

export function SettingsPetControls({
  appSettings,
  onUpdateAppSettings,
  showHeading = true,
}: SettingsPetControlsProps) {
  const { t } = useTranslation(["settings", "common"]);
  const { pets, isLoading: petsLoading, error: petsError, refresh: refreshPets } =
    useAvailablePets();
  const selectedPetId = appSettings.selectedPetId ?? BUILTIN_PET_ID;
  const hasSelectedPet = pets.some((pet) => pet.id === selectedPetId);

  return (
    <>
      {showHeading ? (
        <SettingsSubsection
          title={t("settings:display.petHeading")}
          subtitle={t("settings:display.petDescription")}
        />
      ) : null}
      <SettingsToggleRow
        title={t("settings:display.petOverlayTitle")}
        subtitle={t("settings:display.petOverlaySubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.petOverlayVisible}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              petOverlayVisible: !appSettings.petOverlayVisible,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="pet-select">
          {t("settings:display.petSelectLabel")}
        </label>
        <div className="settings-field-row">
          <select
            id="pet-select"
            className="settings-select"
            value={selectedPetId}
            onChange={(event) =>
              void onUpdateAppSettings({
                ...appSettings,
                selectedPetId: event.target.value,
              })
            }
          >
            {!hasSelectedPet && appSettings.selectedPetId ? (
              <option value={appSettings.selectedPetId}>
                {t("settings:display.petMissingOption", {
                  id: appSettings.selectedPetId,
                })}
              </option>
            ) : null}
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ghost settings-button-compact"
            disabled={petsLoading}
            onClick={() => {
              void refreshPets();
            }}
          >
            {t("common:actions.refresh")}
          </button>
        </div>
        <div className="settings-help">
          {petsError
            ? t("settings:display.petLoadError", { error: petsError })
            : petsLoading
              ? t("settings:display.petLoading")
              : t("settings:display.petSelectHelp")}
        </div>
      </div>
    </>
  );
}
