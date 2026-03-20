import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "@/types";
import type { CommonLinkDraft } from "@settings/components/settingsTypes";
import {
  buildCommonLinkDrafts,
  createCommonLinkId,
  normalizeCommonLinks,
} from "@settings/components/settingsViewHelpers";

type UseSettingsCommonLinksDraftsParams = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  newLinkLabel: string;
};

export const useSettingsCommonLinksDrafts = ({
  appSettings,
  onUpdateAppSettings,
  newLinkLabel,
}: UseSettingsCommonLinksDraftsParams) => {
  const [commonLinkDrafts, setCommonLinkDrafts] = useState<CommonLinkDraft[]>(() =>
    buildCommonLinkDrafts(appSettings.commonLinks),
  );

  useEffect(() => {
    setCommonLinkDrafts(buildCommonLinkDrafts(appSettings.commonLinks));
  }, [appSettings.commonLinks]);

  const commitCommonLinks = useCallback(
    async (drafts: CommonLinkDraft[]) => {
      const nextLinks = normalizeCommonLinks(drafts);
      setCommonLinkDrafts(buildCommonLinkDrafts(nextLinks));
      await onUpdateAppSettings({
        ...appSettings,
        commonLinks: nextLinks,
      });
    },
    [appSettings, onUpdateAppSettings],
  );

  const handleCommonLinkDraftChange = (
    index: number,
    updates: Partial<CommonLinkDraft>,
  ) => {
    setCommonLinkDrafts((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) {
        return prev;
      }
      next[index] = { ...current, ...updates };
      return next;
    });
  };

  const handleMoveCommonLink = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= commonLinkDrafts.length) {
      return;
    }
    const next = [...commonLinkDrafts];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    setCommonLinkDrafts(next);
    void commitCommonLinks(next);
  };

  const handleDeleteCommonLink = (index: number) => {
    const next = commonLinkDrafts.filter((_, draftIndex) => draftIndex !== index);
    setCommonLinkDrafts(next);
    void commitCommonLinks(next);
  };

  const handleAddCommonLink = () => {
    const newLink: CommonLinkDraft = {
      id: createCommonLinkId(),
      label: newLinkLabel,
      url: "",
    };
    const next = [...commonLinkDrafts, newLink];
    setCommonLinkDrafts(next);
    void commitCommonLinks(next);
  };

  const handleCommitCommonLinksDrafts = () => {
    void commitCommonLinks(commonLinkDrafts);
  };

  return {
    commonLinkDrafts,
    handleCommonLinkDraftChange,
    handleCommitCommonLinksDrafts,
    handleMoveCommonLink,
    handleDeleteCommonLink,
    handleAddCommonLink,
  };
};
