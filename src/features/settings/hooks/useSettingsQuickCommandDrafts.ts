import { useCallback, useEffect, useRef, useState } from "react";
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
  const appSettingsRef = useRef(appSettings);
  const [quickCommandDrafts, setQuickCommandDrafts] = useState<AppSettings["quickCommands"]>(
    () => appSettings.quickCommands,
  );
  const quickCommandDraftsRef = useRef<AppSettings["quickCommands"]>(appSettings.quickCommands);

  useEffect(() => {
    appSettingsRef.current = appSettings;
  }, [appSettings]);

  useEffect(() => {
    quickCommandDraftsRef.current = appSettings.quickCommands;
    setQuickCommandDrafts(appSettings.quickCommands);
  }, [appSettings.quickCommands]);

  const commitQuickCommands = useCallback(
    async (drafts: ComposerQuickCommand[]) => {
      await onUpdateAppSettings({
        ...appSettingsRef.current,
        quickCommands: drafts,
      });
    },
    [onUpdateAppSettings],
  );

  const handleQuickCommandDraftChange = useCallback(
    (id: string, updates: Partial<ComposerQuickCommand>) => {
      const next = replaceQuickCommand(quickCommandDraftsRef.current, id, updates);
      quickCommandDraftsRef.current = next;
      setQuickCommandDrafts(next);
    },
    [],
  );

  const handleCommitQuickCommandDrafts = useCallback(() => {
    void commitQuickCommands(quickCommandDraftsRef.current);
  }, [commitQuickCommands]);

  const handleAddQuickCommand = useCallback(() => {
    const next = [
      ...quickCommandDraftsRef.current,
      {
        id: createQuickCommandId(),
        label: "",
        text: "",
      },
    ];
    quickCommandDraftsRef.current = next;
    setQuickCommandDrafts(next);
    void commitQuickCommands(next);
  }, [commitQuickCommands]);

  const handleDeleteQuickCommand = useCallback(
    (id: string) => {
      const next = quickCommandDraftsRef.current.filter((item) => item.id !== id);
      quickCommandDraftsRef.current = next;
      setQuickCommandDrafts(next);
      void commitQuickCommands(next);
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
