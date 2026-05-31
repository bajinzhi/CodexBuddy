// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { AutomationState, WorkspaceInfo } from "@/types";
import {
  automationsDeleteTask,
  automationsList,
  automationsSetTaskEnabled,
  automationsUpsertTask,
} from "@services/tauri";
import { AutomationsPanel } from "./AutomationsPanel";

vi.mock("@services/tauri", () => ({
  automationsDeleteTask: vi.fn(),
  automationsList: vi.fn(),
  automationsSetTaskEnabled: vi.fn(),
  automationsUpsertTask: vi.fn(),
}));

const automationsListMock = vi.mocked(automationsList);
const automationsUpsertTaskMock = vi.mocked(automationsUpsertTask);

function workspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: "workspace-1",
    name: "Project",
    path: "C:/repo",
    connected: true,
    settings: {
      sidebarCollapsed: false,
    },
    ...overrides,
  };
}

function state(overrides: Partial<AutomationState> = {}): AutomationState {
  return {
    tasks: [],
    runs: [],
    ...overrides,
  };
}

async function renderPanel(initialState: AutomationState = state()) {
  automationsListMock.mockResolvedValueOnce(initialState);
  const result = render(
    <AutomationsPanel
      workspaces={[workspace()]}
      defaultExecutionDefaults={{
        modelId: "gpt-5",
        reasoningEffort: "medium",
        serviceTier: "fast",
        accessMode: "current",
        collaborationMode: { id: "plan" },
      }}
      onClose={vi.fn()}
      onOpenThread={vi.fn()}
    />,
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

describe("AutomationsPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.resetAllMocks();
    vi.mocked(automationsDeleteTask).mockResolvedValue(state());
    vi.mocked(automationsSetTaskEnabled).mockResolvedValue(state());
  });

  afterEach(() => {
    cleanup();
  });

  it("test_rq_002_panel_create_task: creates an automation task with prompt, schedule, workspace, and execution defaults", async () => {
    automationsUpsertTaskMock.mockImplementation(async (task) =>
      state({ tasks: [task] }),
    );

    await renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "New automation" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Nightly summary" },
    });
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Summarize what changed today." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save automation" }));

    await waitFor(() => expect(automationsUpsertTaskMock).toHaveBeenCalled());
    expect(automationsUpsertTaskMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        title: "Nightly summary",
        workspaceId: "workspace-1",
        prompt: "Summarize what changed today.",
        schedule: { type: "daily", timeMinutes: expect.any(Number) },
        threadPolicy: { mode: "new" },
        executionDefaults: expect.objectContaining({
          modelId: "gpt-5",
          accessMode: "current",
          collaborationMode: { id: "plan" },
        }),
      }),
    );
  });

  it("test_rq_002_panel_run_history_thread_link: links run history entries back to their thread", async () => {
    const onOpenThread = vi.fn();
    automationsListMock.mockResolvedValueOnce(
      state({
        runs: [
          {
            id: "run-1",
            taskId: "automation-1",
            taskTitle: "Nightly summary",
            workspaceId: "workspace-1",
            prompt: "Summarize",
            status: "completed",
            scheduledForMs: 1,
            startedAtMs: 2,
            finishedAtMs: 3,
            threadId: "thread-1",
            error: null,
          },
        ],
      }),
    );

    render(
      <AutomationsPanel
        workspaces={[workspace()]}
        defaultExecutionDefaults={{}}
        onClose={vi.fn()}
        onOpenThread={onOpenThread}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Runs" }));
    fireEvent.click(screen.getByRole("button", { name: "Open thread" }));

    expect(onOpenThread).toHaveBeenCalledWith("workspace-1", "thread-1");
  });
});
