import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type { PetAnimationDefinition, PetDefinition, PetFormDefinition } from "@/types";
import { readPetAsset } from "@/services/tauri";
import {
  BUILTIN_PETS,
  BUILTIN_PET_ID,
  SNOW_FAWN_PET_ID,
} from "@/features/pets/builtinPets";
import { NeonCorePet } from "@/features/pets/components/NeonCorePet";
import { SnowFawnPet } from "@/features/pets/components/SnowFawnPet";
import { useAvailablePets } from "@/features/pets/hooks/useAvailablePets";
import {
  clampSpriteFps,
  resolveSpriteFrameLayout,
} from "@/features/pets/petSprites";
import type { PetRuntimeState } from "@/features/pets/petRuntime";

const POSITION_STORAGE_KEY = "codexbuddy.petOverlay.position.v1";
const OVERLAY_WIDTH = 132;
const OVERLAY_HEIGHT = 152;
const VIEWPORT_MARGIN = 12;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type PetOverlayProps = {
  visible: boolean;
  selectedPetId: string | null;
  runtimeState: PetRuntimeState;
  onVisibleChange: (visible: boolean) => void;
};

type PetPosition = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type AssetSize = {
  width: number;
  height: number;
};

function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(readPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    handleChange();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return prefersReducedMotion;
}

function clampPosition(position: PetPosition): PetPosition {
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - OVERLAY_WIDTH - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - OVERLAY_HEIGHT - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(position.x, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(position.y, VIEWPORT_MARGIN), maxY),
  };
}

function defaultPosition(): PetPosition {
  return clampPosition({
    x: window.innerWidth - OVERLAY_WIDTH - 24,
    y: window.innerHeight - OVERLAY_HEIGHT - 92,
  });
}

function readStoredPosition(): PetPosition {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) {
      return defaultPosition();
    }
    const parsed = JSON.parse(raw) as Partial<PetPosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return defaultPosition();
    }
    return clampPosition({ x: parsed.x, y: parsed.y });
  } catch {
    return defaultPosition();
  }
}

function writeStoredPosition(position: PetPosition) {
  try {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Local storage can be unavailable in hardened runtimes.
  }
}

function findPet(pets: PetDefinition[], selectedPetId: string | null): PetDefinition {
  return (
    pets.find((pet) => pet.id === selectedPetId) ??
    pets.find((pet) => pet.id === BUILTIN_PET_ID) ??
    pets[0] ??
    BUILTIN_PETS[0]
  );
}

function findForm(pet: PetDefinition, formId: string): PetFormDefinition | null {
  return (
    pet.forms.find((form) => form.id === formId) ??
    pet.forms.find((form) => form.id === "normal") ??
    pet.forms[0] ??
    null
  );
}

function findAnimation(
  form: PetFormDefinition | null,
  status: string,
): PetAnimationDefinition | null {
  if (!form) {
    return null;
  }
  return (
    form.animations.find((animation) => animation.state === status) ??
    form.animations.find((animation) => animation.state === "idle") ??
    form.animations[0] ??
    null
  );
}

function renderBuiltinPet(petId: string, runtimeState: PetRuntimeState) {
  if (petId === SNOW_FAWN_PET_ID) {
    return <SnowFawnPet runtimeState={runtimeState} />;
  }
  return <NeonCorePet runtimeState={runtimeState} />;
}

export function PetOverlay({
  visible,
  selectedPetId,
  runtimeState,
  onVisibleChange,
}: PetOverlayProps) {
  const {
    pets,
    isLoading: petsLoading,
    refresh: refreshPets,
  } = useAvailablePets();
  const [position, setPosition] = useState<PetPosition | null>(null);
  const [assetDataUrl, setAssetDataUrl] = useState<string | null>(null);
  const [assetSize, setAssetSize] = useState<AssetSize | null>(null);
  const [spriteFrame, setSpriteFrame] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const missingRefreshRef = useRef<string | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const selectedPetMissing = Boolean(
    selectedPetId && !pets.some((pet) => pet.id === selectedPetId),
  );
  const selectedPet = useMemo(() => findPet(pets, selectedPetId), [pets, selectedPetId]);
  const selectedForm = useMemo(
    () => findForm(selectedPet, runtimeState.form),
    [runtimeState.form, selectedPet],
  );
  const selectedAnimation = useMemo(
    () => findAnimation(selectedForm, runtimeState.status),
    [runtimeState.status, selectedForm],
  );
  const assetPath = selectedAnimation?.assetPath?.trim() || null;
  const externalAssetDataUrl = selectedPet.source === "builtin" ? null : assetDataUrl;
  const spriteFrameCount = selectedAnimation?.frameCount ?? null;
  const spriteFrameWidth = selectedAnimation?.frameWidth ?? null;
  const spriteFrameHeight =
    selectedAnimation?.frameHeight ?? selectedAnimation?.frameWidth ?? null;
  const spriteLayout = resolveSpriteFrameLayout({
    frameIndex: spriteFrame,
    frameCount: spriteFrameCount,
    frameWidth: spriteFrameWidth,
    frameHeight: spriteFrameHeight,
    naturalWidth: assetSize?.width ?? null,
  });
  const canRenderSprite = Boolean(
    externalAssetDataUrl && spriteLayout && spriteFrameWidth && spriteFrameHeight,
  );
  const spriteFps = clampSpriteFps(selectedAnimation?.fps);
  const spriteScale =
    spriteFrameWidth && spriteFrameHeight
      ? Math.min(1, 88 / spriteFrameWidth, 88 / spriteFrameHeight)
      : 1;
  const spriteStyle = canRenderSprite && spriteLayout && spriteFrameWidth && spriteFrameHeight
    ? ({
        width: spriteFrameWidth,
        height: spriteFrameHeight,
        backgroundImage: `url("${externalAssetDataUrl}")`,
        backgroundPosition: `${spriteLayout.x}px ${spriteLayout.y}px`,
        backgroundSize: assetSize
          ? `${assetSize.width}px ${assetSize.height}px`
          : undefined,
        transform: `scale(${spriteScale})`,
      } satisfies CSSProperties)
    : undefined;

  useEffect(() => {
    if (
      !visible ||
      !selectedPetId ||
      !selectedPetMissing ||
      petsLoading ||
      missingRefreshRef.current === selectedPetId
    ) {
      return;
    }
    missingRefreshRef.current = selectedPetId;
    void refreshPets();
  }, [petsLoading, refreshPets, selectedPetId, selectedPetMissing, visible]);

  useEffect(() => {
    if (!selectedPetMissing) {
      missingRefreshRef.current = null;
    }
  }, [selectedPetMissing]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setPosition((current) => current ?? readStoredPosition());
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const handleResize = () => {
      setPosition((current) => {
        const next = current ? clampPosition(current) : defaultPosition();
        writeStoredPosition(next);
        return next;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [visible]);

  useEffect(() => {
    let cancelled = false;
    setAssetDataUrl(null);
    setAssetSize(null);
    setSpriteFrame(0);
    if (!assetPath || selectedPet.source === "builtin") {
      return () => {
        cancelled = true;
      };
    }
    void readPetAsset(selectedPet.id, assetPath)
      .then((response) => {
        if (!cancelled) {
          setAssetDataUrl(response.dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssetDataUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assetPath, selectedPet.id, selectedPet.source]);

  useEffect(() => {
    if (!assetDataUrl || !spriteFrameCount || spriteFrameCount <= 1) {
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setAssetSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      }
    };
    image.src = assetDataUrl;
    return () => {
      cancelled = true;
    };
  }, [assetDataUrl, spriteFrameCount]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setSpriteFrame(0);
      return;
    }
    if (!canRenderSprite || !spriteFrameCount || spriteFrameCount <= 1) {
      return;
    }
    const interval = window.setInterval(() => {
      setSpriteFrame((current) => (current + 1) % spriteFrameCount);
    }, 1000 / spriteFps);
    return () => window.clearInterval(interval);
  }, [canRenderSprite, prefersReducedMotion, spriteFps, spriteFrameCount]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !position) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-pet-control='true']")) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
      };
    },
    [position],
  );

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const next = clampPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
    setPosition(next);
  }, []);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setPosition((current) => {
      const next = current ? clampPosition(current) : defaultPosition();
      writeStoredPosition(next);
      return next;
    });
  }, []);

  if (!visible) {
    return null;
  }

  const style = position
    ? ({
        left: position.x,
        top: position.y,
      } satisfies CSSProperties)
    : undefined;

  return (
    <div
      className={`pet-overlay pet-overlay--${runtimeState.form} pet-overlay--${runtimeState.status}`}
      style={style}
      role="status"
      aria-live="polite"
      aria-label={`Pet: ${runtimeState.label}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <button
        type="button"
        className="pet-overlay-close"
        data-pet-control="true"
        aria-label="Hide pet"
        title="Hide pet"
        onClick={() => onVisibleChange(false)}
      >
        x
      </button>
      <div className="pet-overlay-stage" aria-hidden="true">
        {externalAssetDataUrl && canRenderSprite ? (
          <div className="pet-overlay-sprite-frame">
            <div className="pet-overlay-sprite" style={spriteStyle} />
          </div>
        ) : externalAssetDataUrl ? (
          <img className="pet-overlay-image" src={externalAssetDataUrl} alt="" draggable={false} />
        ) : selectedPet.source === "builtin" ? (
          renderBuiltinPet(selectedPet.id, runtimeState)
        ) : (
          <NeonCorePet runtimeState={runtimeState} />
        )}
      </div>
      <div className="pet-overlay-label">{runtimeState.label}</div>
    </div>
  );
}
