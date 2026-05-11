import { describe, expect, it } from "vitest";
import { clampSpriteFps, resolveSpriteFrameLayout } from "@/features/pets/petSprites";

describe("pet sprite helpers", () => {
  it("computes sprite frame offsets for grid sheets", () => {
    expect(
      resolveSpriteFrameLayout({
        frameIndex: 5,
        frameCount: 8,
        frameWidth: 32,
        frameHeight: 24,
        naturalWidth: 128,
      }),
    ).toEqual({
      x: -32,
      y: -24,
      columns: 4,
    });
  });

  it("falls back to horizontal sheets before image dimensions are known", () => {
    expect(
      resolveSpriteFrameLayout({
        frameIndex: 2,
        frameCount: 4,
        frameWidth: 16,
        frameHeight: 16,
        naturalWidth: null,
      }),
    ).toMatchObject({
      x: -32,
      y: 0,
      columns: 4,
    });
  });

  it("clamps sprite fps to a bounded interval", () => {
    expect(clampSpriteFps(null)).toBe(8);
    expect(clampSpriteFps(0)).toBe(1);
    expect(clampSpriteFps(120)).toBe(30);
  });
});
