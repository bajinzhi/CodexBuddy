// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { BranchInfo, WorkspaceInfo } from "../../../types";
import { MainHeader } from "./MainHeader";

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Repo",
  path: "/tmp/repo",
  connected: true,
  settings: {
    sidebarCollapsed: false,
  },
};

const branches: BranchInfo[] = [
  {
    name: "main",
    lastCommit: 1,
  },
];

afterEach(() => {
  cleanup();
});

describe("MainHeader", () => {
  it("refreshes branch validation copy after switching languages", async () => {
    render(
      <MainHeader
        workspace={workspace}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => {}}
        branchName="main"
        branches={branches}
        onCheckoutBranch={vi.fn()}
        onCreateBranch={vi.fn()}
        onToggleTerminal={vi.fn()}
        isTerminalOpen={false}
        showTerminalButton={false}
        showWorkspaceTools={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "main" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "hello world" },
    });

    expect(screen.getByText("Branch name cannot contain spaces.")).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage("zh-CN");
    });

    expect(await screen.findByText("分支名称不能包含空格。")).toBeTruthy();
    expect(screen.queryByText("Branch name cannot contain spaces.")).toBeNull();
  });
});
