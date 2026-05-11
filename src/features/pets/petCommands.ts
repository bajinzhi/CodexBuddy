export type PetCommandAction = "toggle" | "show" | "hide" | "status" | "invalid";

export type PetCommand = {
  action: PetCommandAction;
  argument: string | null;
};

export function parsePetCommand(text: string): PetCommand {
  const argument = text.replace(/^\/pet\b/i, "").trim().toLowerCase();
  if (!argument) {
    return { action: "toggle", argument: null };
  }
  if (["on", "show", "open", "enable"].includes(argument)) {
    return { action: "show", argument };
  }
  if (["off", "hide", "close", "disable"].includes(argument)) {
    return { action: "hide", argument };
  }
  if (argument === "status") {
    return { action: "status", argument };
  }
  return { action: "invalid", argument };
}
