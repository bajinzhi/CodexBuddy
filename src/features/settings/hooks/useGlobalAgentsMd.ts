import { readGlobalAgentsMd, writeGlobalAgentsMd } from "@services/tauri";
import { useFileEditor } from "@/features/shared/hooks/useFileEditor";
import { translate } from "@/i18n/translate";

export function useGlobalAgentsMd() {
  return useFileEditor({
    key: "global-agents",
    read: readGlobalAgentsMd,
    write: writeGlobalAgentsMd,
    readErrorTitle: () => translate("codex.globalAgentsReadErrorTitle", { ns: "settings" }),
    writeErrorTitle: () => translate("codex.globalAgentsWriteErrorTitle", { ns: "settings" }),
  });
}
