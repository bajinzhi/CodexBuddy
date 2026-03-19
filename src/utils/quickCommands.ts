import type { ComposerQuickCommand } from "@/types";

function createFallbackId(index?: number) {
  const suffix =
    typeof index === "number" ? `${index + 1}` : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `quick-command-${suffix}`;
}

export function createQuickCommandId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return createFallbackId();
}

export function normalizeQuickCommands(
  value: ComposerQuickCommand[] | null | undefined,
): ComposerQuickCommand[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set<string>();

  return value
    .filter(Boolean)
    .map((entry, index) => {
      const baseId =
        typeof entry.id === "string" && entry.id.trim().length > 0
          ? entry.id.trim()
          : createFallbackId(index);
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);

      return {
        id,
        label: typeof entry.label === "string" ? entry.label : "",
        text: typeof entry.text === "string" ? entry.text : "",
      };
    });
}

export function isQuickCommandUsable(command: ComposerQuickCommand) {
  return command.text.trim().length > 0;
}

export function getQuickCommandLabel(command: ComposerQuickCommand) {
  const label = command.label.trim();
  if (label.length > 0) {
    return label;
  }
  const firstLine = command.text.trim().split(/\r?\n/, 1)[0] ?? "";
  return firstLine || "Untitled command";
}
