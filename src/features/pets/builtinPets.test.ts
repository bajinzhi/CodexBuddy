import { describe, expect, it } from "vitest";
import { BUILTIN_PETS, SNOW_FAWN_PET_ID } from "@/features/pets/builtinPets";

describe("BUILTIN_PETS", () => {
  it("uses unique ids for builtin pets", () => {
    const ids = BUILTIN_PETS.map((pet) => pet.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares every runtime state needed by Snow Fawn", () => {
    const pet = BUILTIN_PETS.find((entry) => entry.id === SNOW_FAWN_PET_ID);

    expect(pet).toBeDefined();
    expect(pet?.source).toBe("builtin");

    const stateByForm = new Map(
      pet?.forms.map((form) => [
        form.id,
        new Set(form.animations.map((animation) => animation.state)),
      ]) ?? [],
    );

    expect(stateByForm.get("normal")).toEqual(new Set(["idle", "celebrate"]));
    expect(stateByForm.get("active")).toEqual(new Set(["working"]));
    expect(stateByForm.get("alert")).toEqual(new Set(["needs_input", "needs_approval"]));
    expect(stateByForm.get("resting")).toEqual(new Set(["sleep"]));
    expect(stateByForm.get("charged")).toEqual(new Set(["working"]));
  });
});
