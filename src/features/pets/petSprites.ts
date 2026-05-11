export type SpriteFrameLayoutInput = {
  frameIndex: number;
  frameCount: number | null | undefined;
  frameWidth: number | null | undefined;
  frameHeight: number | null | undefined;
  naturalWidth: number | null | undefined;
};

export type SpriteFrameLayout = {
  x: number;
  y: number;
  columns: number;
};

export function clampSpriteFps(fps: number | null | undefined): number {
  if (typeof fps !== "number" || !Number.isFinite(fps)) {
    return 8;
  }
  return Math.min(Math.max(Math.round(fps), 1), 30);
}

export function resolveSpriteFrameLayout({
  frameIndex,
  frameCount,
  frameWidth,
  frameHeight,
  naturalWidth,
}: SpriteFrameLayoutInput): SpriteFrameLayout | null {
  if (
    typeof frameCount !== "number" ||
    typeof frameWidth !== "number" ||
    typeof frameHeight !== "number" ||
    frameCount <= 1 ||
    frameWidth <= 0 ||
    frameHeight <= 0
  ) {
    return null;
  }

  const safeIndex = ((Math.trunc(frameIndex) % frameCount) + frameCount) % frameCount;
  const columns =
    typeof naturalWidth === "number" && naturalWidth >= frameWidth
      ? Math.max(1, Math.floor(naturalWidth / frameWidth))
      : frameCount;
  const column = safeIndex % columns;
  const row = Math.floor(safeIndex / columns);
  return {
    x: column === 0 ? 0 : -column * frameWidth,
    y: row === 0 ? 0 : -row * frameHeight,
    columns,
  };
}
