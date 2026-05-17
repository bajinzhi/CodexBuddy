import type { PetDefinition } from "@/types";

export const BUILTIN_PET_ID = "buddy-spark";
export const SNOW_FAWN_PET_ID = "snow-fawn";

export const BUILTIN_PETS: PetDefinition[] = [
  {
    id: BUILTIN_PET_ID,
    name: "Neon Core",
    source: "builtin",
    description: "Built-in retro-futuristic drone pet.",
    thumbnailPath: null,
    thumbnailDataUrl: null,
    forms: [
      {
        id: "normal",
        label: "Normal",
        animations: [{ state: "idle" }, { state: "celebrate" }],
      },
      {
        id: "active",
        label: "Active",
        animations: [{ state: "working" }],
      },
      {
        id: "alert",
        label: "Alert",
        animations: [{ state: "needs_input" }, { state: "needs_approval" }],
      },
      {
        id: "resting",
        label: "Resting",
        animations: [{ state: "sleep" }],
      },
      {
        id: "charged",
        label: "Charged",
        animations: [{ state: "working" }],
      },
    ],
  },
  {
    id: SNOW_FAWN_PET_ID,
    name: "Snow Fawn",
    source: "builtin",
    description: "Built-in fairy-tale forest fawn pet.",
    thumbnailPath: null,
    thumbnailDataUrl: null,
    forms: [
      {
        id: "normal",
        label: "Normal",
        animations: [{ state: "idle" }, { state: "celebrate" }],
      },
      {
        id: "active",
        label: "Active",
        animations: [{ state: "working" }],
      },
      {
        id: "alert",
        label: "Alert",
        animations: [{ state: "needs_input" }, { state: "needs_approval" }],
      },
      {
        id: "resting",
        label: "Resting",
        animations: [{ state: "sleep" }],
      },
      {
        id: "charged",
        label: "Charged",
        animations: [{ state: "working" }],
      },
    ],
  },
];
