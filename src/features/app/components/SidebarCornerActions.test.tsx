// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { SidebarCornerActions } from "./SidebarCornerActions";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

function renderActions(overrides: Partial<Parameters<typeof SidebarCornerActions>[0]> = {}) {
  return render(
    <SidebarCornerActions
      commonLinks={[]}
      onOpenSettings={vi.fn()}
      onOpenAiRadar={vi.fn()}
      onOpenAutomations={vi.fn()}
      onOpenDebug={vi.fn()}
      showDebugButton={false}
      showAccountSwitcher={false}
      accountLabel="Account"
      accountActionLabel="Switch"
      accountDisabled={false}
      accountSwitching={false}
      accountCancelDisabled={false}
      onSwitchAccount={vi.fn()}
      onCancelSwitchAccount={vi.fn()}
      {...overrides}
    />,
  );
}

describe("SidebarCornerActions", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
  });

  it("test_rq_002_sidebar_entry: opens automations from the lower-left icon action", () => {
    const onOpenAutomations = vi.fn();

    renderActions({ onOpenAutomations });
    fireEvent.click(screen.getByRole("button", { name: "Open automations" }));

    expect(onOpenAutomations).toHaveBeenCalledTimes(1);
  });
});
