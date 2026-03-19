import { useCallback, useEffect, useState } from "react";
import type { AppSettings, ComposerQuickCommand } from "@/types";
import { createQuickCommandId } from "@/utils/quickCommands";

type UseSettingsQuickCommandDraftsParams = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

function replaceQuickCommand(
  items: ComposerQuickCommand[],
  id: string,
  updates: Partial<ComposerQuickCommand>,
) {
  return items.map((item) => (item.id === id ? { ...item, ...updates } : item));
}

export function useSettingsQuickCommandDrafts({
  appSettings,
  onUpdateAppSettings,
}: UseSettingsQuickCommandDraftsParams) {
  const [quickCommandDrafts, setQuickCommandDrafts] = useState<AppSettings["quickCommands"]>(
    () => appSettings.quickCommands,
  );

  useEffect(() => {
    setQuickCommandDrafts(appSettings.quickCommands);
  }, [appSettings.quickCommands]);

  const commitQuickCommands = useCallback(
    async (drafts: ComposerQuickCommand[]) => {
      await onUpdateAppSettings({
        ...appSettings,
        quickCommands: drafts,
      });
    },
    [appSettings, onUpdateAppSettings],
  );

  const handleQuickCommandDraftChange = useCallback(
    (id: string, updates: Partial<ComposerQuickCommand>) => {
      setQuickCommandDrafts((prev) => replaceQuickCommand(prev, id, updates));
    },
    [],
  );

  const handleCommitQuickCommandDrafts = useCallback(() => {
    void commitQuickCommands(quickCommandDrafts);
  }, [commitQuickCommands, quickCommandDrafts]);

  const handleAddQuickCommand = useCallback(() => {
    setQuickCommandDrafts((prev) => {
      const next = [
        ...prev,
        {
          id: createQuickCommandId(),
          label: "",
          text: "",
        },
      ];
      void commitQuickCommands(next);
      return next;
    });
  }, [commitQuickCommands]);

  const handleDeleteQuickCommand = useCallback(
    (id: string) => {
      setQuickCommandDrafts((prev) => {
        const next = prev.filter((item) => item.id !== id);
        void commitQuickCommands(next);
        return next;
      });
    },
    [commitQuickCommands],
  );

  return {
    quickCommandDrafts,
    handleQuickCommandDraftChange,
    handleCommitQuickCommandDrafts,
    handleAddQuickCommand,
    handleDeleteQuickCommand,
  };
}
