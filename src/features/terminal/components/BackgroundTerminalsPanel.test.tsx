// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ask } from "@tauri-apps/plugin-dialog";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listThreadBackgroundTerminals,
  terminateThreadBackgroundTerminal,
} from "@services/tauri";
import { BackgroundTerminalsPanel } from "./BackgroundTerminalsPanel";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
}));

vi.mock("@services/tauri", () => ({
  cleanThreadBackgroundTerminals: vi.fn(),
  listThreadBackgroundTerminals: vi.fn(),
  terminateThreadBackgroundTerminal: vi.fn(),
}));

const askMock = vi.mocked(ask);
const listThreadBackgroundTerminalsMock = vi.mocked(listThreadBackgroundTerminals);
const terminateThreadBackgroundTerminalMock = vi.mocked(
  terminateThreadBackgroundTerminal,
);

describe("BackgroundTerminalsPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows an error when terminating a background terminal fails", async () => {
    listThreadBackgroundTerminalsMock.mockResolvedValue({
      result: {
        data: [
          {
            processId: "proc-1",
            command: "npm run dev",
            cwd: "/repo",
            osPid: 123,
          },
        ],
      },
    });
    askMock.mockResolvedValueOnce(true);
    terminateThreadBackgroundTerminalMock.mockRejectedValueOnce(
      new Error("terminate failed"),
    );

    render(<BackgroundTerminalsPanel workspaceId="ws-1" threadId="thread-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));

    expect(await screen.findByText(/terminate failed/i)).toBeTruthy();
    expect(screen.getByText("npm run dev")).toBeTruthy();
  });
});
