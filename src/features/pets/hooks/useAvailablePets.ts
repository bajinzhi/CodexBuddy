import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { PetDefinition } from "@/types";
import { listPets } from "@/services/tauri";
import { BUILTIN_PETS } from "@/features/pets/builtinPets";

type AvailablePetsState = {
  pets: PetDefinition[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

type PetCatalogSnapshot = {
  customPets: PetDefinition[];
  isLoading: boolean;
  error: string | null;
  hasLoaded: boolean;
};

let catalogSnapshot: PetCatalogSnapshot = {
  customPets: [],
  isLoading: false,
  error: null,
  hasLoaded: false,
};
let refreshPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function mergePets(customPets: PetDefinition[]): PetDefinition[] {
  const seen = new Set<string>();
  const merged: PetDefinition[] = [];
  for (const pet of [...BUILTIN_PETS, ...customPets]) {
    if (!pet.id || seen.has(pet.id)) {
      continue;
    }
    seen.add(pet.id);
    merged.push(pet);
  }
  return merged;
}

function emitCatalog(next: Partial<PetCatalogSnapshot>) {
  catalogSnapshot = {
    ...catalogSnapshot,
    ...next,
  };
  listeners.forEach((listener) => listener());
}

function subscribeCatalog(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCatalogSnapshot() {
  return catalogSnapshot;
}

export function refreshPetsCatalog(): Promise<void> {
  if (refreshPromise) {
    return refreshPromise;
  }

  emitCatalog({ isLoading: true, error: null });
  refreshPromise = listPets()
    .then((customPets) => {
      emitCatalog({
        customPets,
        isLoading: false,
        error: null,
        hasLoaded: true,
      });
    })
    .catch((err) => {
      emitCatalog({
        isLoading: false,
        error: err instanceof Error ? err.message : String(err),
        hasLoaded: true,
      });
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export function useAvailablePets(): AvailablePetsState {
  const catalog = useSyncExternalStore(
    subscribeCatalog,
    getCatalogSnapshot,
    getCatalogSnapshot,
  );
  const refresh = useCallback(() => refreshPetsCatalog(), []);

  useEffect(() => {
    if (!catalog.hasLoaded && !catalog.isLoading) {
      void refresh();
    }
  }, [catalog.hasLoaded, catalog.isLoading, refresh]);

  const pets = useMemo(() => mergePets(catalog.customPets), [catalog.customPets]);

  return {
    pets,
    isLoading: catalog.isLoading,
    error: catalog.error,
    refresh,
  };
}
