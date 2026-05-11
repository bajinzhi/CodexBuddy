import { describe, expect, it } from "vitest";
import { parsePetCommand } from "@/features/pets/petCommands";

describe("parsePetCommand", () => {
  it("parses visibility commands", () => {
    expect(parsePetCommand("/pet")).toEqual({ action: "toggle", argument: null });
    expect(parsePetCommand("/pet on")).toEqual({ action: "show", argument: "on" });
    expect(parsePetCommand("/pet off")).toEqual({ action: "hide", argument: "off" });
  });

  it("parses status and invalid arguments", () => {
    expect(parsePetCommand("/pet status")).toEqual({
      action: "status",
      argument: "status",
    });
    expect(parsePetCommand("/pet dance")).toEqual({
      action: "invalid",
      argument: "dance",
    });
  });
});
