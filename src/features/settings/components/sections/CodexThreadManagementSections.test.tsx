// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import {
  listLoadedThreads,
  listThreads,
  listWorkspaces,
  unarchiveThread,
} from "@services/tauri";
import {
  ArchivedThreadsSection,
  LoadedThreadsSection,
} from "./CodexThreadManagementSections";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
}));

vi.mock("@services/tauri", () => ({
  deleteThread: vi.fn(),
  listLoadedThreads: vi.fn(),
  listThreads: vi.fn(),
  listWorkspaces: vi.fn(),
  unarchiveThread: vi.fn(),
  unsubscribeThread: vi.fn(),
}));

const listWorkspacesMock = vi.mocked(listWorkspaces);
const listThreadsMock = vi.mocked(listThreads);
const listLoadedThreadsMock = vi.mocked(listLoadedThreads);
const unarchiveThreadMock = vi.mocked(unarchiveThread);

function workspace(
  id: string,
  name: string,
  connected: boolean,
): WorkspaceInfo {
  return {
    id,
    name,
    path: `/repo/${id}`,
    connected,
    settings: { sidebarCollapsed: false },
  };
}

describe("Codex thread management settings sections", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads archived threads from connected workspaces while ignoring disconnected and failed workspaces", async () => {
    listWorkspacesMock.mockResolvedValueOnce([
      workspace("ws-good", "Good workspace", true),
      workspace("ws-bad", "Bad workspace", true),
      workspace("ws-offline", "Offline workspace", false),
    ]);
    listThreadsMock.mockImplementation(async (workspaceId) => {
      if (workspaceId === "ws-good") {
        return {
          result: {
            data: [
              {
                id: "thread-1",
                preview: "Archived review thread",
                updatedAt: 1_700_000_000,
                recencyAt: 1_700_000_000,
              },
            ],
          },
        };
      }
      throw new Error(`${workspaceId} unavailable`);
    });

    render(<ArchivedThreadsSection />);

    expect(await screen.findByText("Archived review thread")).toBeTruthy();
    await waitFor(() => {
      expect(listThreadsMock).toHaveBeenCalledTimes(2);
    });
    expect(listThreadsMock).toHaveBeenCalledWith(
      "ws-good",
      null,
      50,
      "recency_at",
      null,
      true,
    );
    expect(listThreadsMock).toHaveBeenCalledWith(
      "ws-bad",
      null,
      50,
      "recency_at",
      null,
      true,
    );
    expect(listThreadsMock).not.toHaveBeenCalledWith(
      "ws-offline",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(screen.getByText(/Bad workspace: ws-bad unavailable/i)).toBeTruthy();
  });

  it("shows an error when unarchiving an archived thread fails", async () => {
    listWorkspacesMock.mockResolvedValueOnce([
      workspace("ws-good", "Good workspace", true),
    ]);
    listThreadsMock.mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "thread-1",
            preview: "Archived review thread",
            updatedAt: 1_700_000_000,
          },
        ],
      },
    });
    unarchiveThreadMock.mockRejectedValueOnce(new Error("unarchive failed"));

    render(<ArchivedThreadsSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Unarchive" }));

    expect(await screen.findByText(/unarchive failed/i)).toBeTruthy();
    expect(screen.getByText("Archived review thread")).toBeTruthy();
  });

  it("loads additional archived thread pages when the server returns a cursor", async () => {
    listWorkspacesMock.mockResolvedValueOnce([
      workspace("ws-good", "Good workspace", true),
    ]);
    listThreadsMock
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-1",
              preview: "Archived first page",
              updatedAt: 1_700_000_000,
            },
          ],
          nextCursor: "cursor-2",
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-2",
              preview: "Archived second page",
              updatedAt: 1_699_999_000,
            },
          ],
          nextCursor: null,
        },
      });

    render(<ArchivedThreadsSection />);

    expect(await screen.findByText("Archived first page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Archived second page")).toBeTruthy();
    expect(listThreadsMock).toHaveBeenLastCalledWith(
      "ws-good",
      "cursor-2",
      50,
      "recency_at",
      null,
      true,
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("loads runtime threads from connected workspaces only", async () => {
    listWorkspacesMock.mockResolvedValueOnce([
      workspace("ws-good", "Good workspace", true),
      workspace("ws-offline", "Offline workspace", false),
    ]);
    listLoadedThreadsMock.mockImplementation(async (workspaceId) => {
      if (workspaceId !== "ws-good") {
        throw new Error("offline workspace should not be queried");
      }
      return {
        result: {
          data: [{ threadId: "thread-loaded", status: "loaded" }],
        },
      };
    });

    render(<LoadedThreadsSection />);

    expect(await screen.findByText("thread-loaded")).toBeTruthy();
    await waitFor(() => {
      expect(listLoadedThreadsMock).toHaveBeenCalledTimes(1);
    });
    expect(listLoadedThreadsMock).toHaveBeenCalledWith("ws-good", null, 100);
  });
});
