// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readPetAsset } from "@/services/tauri";
import type { PetRuntimeState } from "@/features/pets/petRuntime";
import { PetOverlay } from "./PetOverlay";

vi.mock("@/services/tauri", () => ({
  readPetAsset: vi.fn(),
}));

vi.mock("@/features/pets/hooks/useAvailablePets", () => ({
  useAvailablePets: () => ({
    pets: [
      {
        id: "snow-fawn",
        name: "Snow Fawn",
        source: "builtin",
        forms: [
          {
            id: "normal",
            label: "Normal",
            animations: [{ state: "idle" }, { state: "celebrate" }],
          },
        ],
      },
      {
        id: "custom-sprite",
        name: "Custom Sprite",
        source: "codex",
        forms: [
          {
            id: "normal",
            label: "Normal",
            animations: [
              {
                state: "idle",
                assetPath: "idle.png",
                frameCount: 2,
                frameWidth: 16,
                frameHeight: 16,
                fps: 10,
              },
            ],
          },
        ],
      },
    ],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const idleRuntimeState: PetRuntimeState = {
  form: "normal",
  status: "idle",
  label: "Idle",
};

const chargedRuntimeState: PetRuntimeState = {
  form: "charged",
  status: "working",
  label: "Deep work",
};

describe("PetOverlay", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("renders the Snow Fawn builtin pet without reading custom assets", () => {
    mockReducedMotion(false);

    const { container } = render(
      <PetOverlay
        visible
        selectedPetId="snow-fawn"
        runtimeState={idleRuntimeState}
        onVisibleChange={vi.fn()}
      />,
    );

    expect(container.querySelector(".pet-fawn-svg")).not.toBeNull();
    expect(readPetAsset).not.toHaveBeenCalled();
  });

  it("renders the Snow Fawn charged decor for deep work", () => {
    mockReducedMotion(false);

    const { container } = render(
      <PetOverlay
        visible
        selectedPetId="snow-fawn"
        runtimeState={chargedRuntimeState}
        onVisibleChange={vi.fn()}
      />,
    );

    expect(container.querySelector(".pet-fawn-charge")).not.toBeNull();
    expect(container.querySelector(".pet-fawn-work-lines")).toBeNull();
  });

  it("does not advance sprite frames when reduced motion is enabled", async () => {
    mockReducedMotion(true);
    vi.mocked(readPetAsset).mockResolvedValue({
      dataUrl: "data:image/png;base64,c3ByaXRl",
    });
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    const { container } = render(
      <PetOverlay
        visible
        selectedPetId="custom-sprite"
        runtimeState={idleRuntimeState}
        onVisibleChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".pet-overlay-sprite")).not.toBeNull();
    });

    expect(setIntervalSpy).not.toHaveBeenCalledWith(expect.any(Function), 100);
  });
});
