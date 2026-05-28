/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadTokenUsage } from "../../../types";
import { ComposerMetaBar } from "./ComposerMetaBar";

const zeroBreakdown = {
  totalTokens: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
};

const baseProps = {
  disabled: false,
  collaborationModes: [],
  selectedCollaborationModeId: null,
  onSelectCollaborationMode: () => {},
  models: [],
  selectedModelId: null,
  onSelectModel: () => {},
  reasoningOptions: [],
  selectedEffort: null,
  onSelectEffort: () => {},
  selectedServiceTier: null,
  reasoningSupported: false,
  accessMode: "current" as const,
  onSelectAccessMode: () => {},
};

function buildUsage(
  totalTokens: number,
  modelContextWindow: number | null,
): ThreadTokenUsage {
  return {
    total: {
      ...zeroBreakdown,
      totalTokens,
    },
    last: {
      ...zeroBreakdown,
      totalTokens,
    },
    modelContextWindow,
  };
}

describe("ComposerMetaBar context meter", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a full bar when the context window is unused", () => {
    render(<ComposerMetaBar {...baseProps} contextUsage={buildUsage(0, 8192)} />);

    const bar = screen.getByRole("progressbar", { name: "Context" });
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.getAttribute("title")).toContain("100% free");
    expect(screen.getByText("100% free")).toBeTruthy();
  });

  it("marks the meter as critical when context is nearly full", () => {
    render(<ComposerMetaBar {...baseProps} contextUsage={buildUsage(3800, 4000)} />);

    const bar = screen.getByRole("progressbar", { name: "Context" });
    expect(bar.getAttribute("aria-valuenow")).toBe("5");
    expect(bar.closest(".composer-context")?.getAttribute("data-state")).toBe("critical");
    expect(screen.getByText("5% free")).toBeTruthy();
  });

  it("shows an unavailable state when the context window is missing", () => {
    render(<ComposerMetaBar {...baseProps} contextUsage={buildUsage(1200, null)} />);

    const bar = screen.getByRole("progressbar", { name: "Context" });
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(bar.getAttribute("title")).toBe("Context unavailable");
    expect(screen.getByText("Context unavailable")).toBeTruthy();
  });

  it("checks the Plan toggle when plan collaboration mode is selected", () => {
    render(
      <ComposerMetaBar
        {...baseProps}
        collaborationModes={[
          { id: "plan", label: "Plan" },
          { id: "default", label: "Default" },
        ]}
        selectedCollaborationModeId="plan"
      />,
    );

    expect(
      (screen.getByRole("checkbox", { name: "Plan mode" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("switches to default mode when the Plan toggle is unchecked", () => {
    const onSelectCollaborationMode = vi.fn();
    render(
      <ComposerMetaBar
        {...baseProps}
        collaborationModes={[
          { id: "plan", label: "Plan" },
          { id: "default", label: "Default" },
        ]}
        selectedCollaborationModeId="plan"
        onSelectCollaborationMode={onSelectCollaborationMode}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Plan mode" }));

    expect(onSelectCollaborationMode).toHaveBeenCalledWith("default");
  });
});
