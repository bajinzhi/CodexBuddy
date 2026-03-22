import { readGlobalCodexConfigToml, writeGlobalCodexConfigToml } from "@services/tauri";
import { useFileEditor } from "@/features/shared/hooks/useFileEditor";
import { translate } from "@/i18n/translate";

export function useGlobalCodexConfigToml() {
  return useFileEditor({
    key: "global-config",
    read: readGlobalCodexConfigToml,
    write: writeGlobalCodexConfigToml,
    readErrorTitle: () => translate("codex.globalConfigReadErrorTitle", { ns: "settings" }),
    writeErrorTitle: () => translate("codex.globalConfigWriteErrorTitle", { ns: "settings" }),
  });
}
