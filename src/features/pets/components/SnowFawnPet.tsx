import type { PetRuntimeState } from "@/features/pets/petRuntime";

type SnowFawnPetProps = {
  runtimeState: PetRuntimeState;
};

function renderFace(runtimeState: PetRuntimeState) {
  if (runtimeState.status === "sleep") {
    return (
      <>
        <path className="pet-fawn-eye pet-fawn-eye--sleep" d="M48 54 C51 57 55 57 58 54" />
        <path className="pet-fawn-eye pet-fawn-eye--sleep" d="M66 54 C69 57 73 57 76 54" />
        <path className="pet-fawn-mouth" d="M58 66 C62 69 67 69 71 66" />
      </>
    );
  }

  if (runtimeState.status === "needs_approval") {
    return (
      <>
        <path className="pet-fawn-brow pet-fawn-brow--alert" d="M46 49 L57 52" />
        <path className="pet-fawn-brow pet-fawn-brow--alert" d="M67 52 L78 49" />
        <circle className="pet-fawn-eye" cx="53" cy="56" r="2.8" />
        <circle className="pet-fawn-eye" cx="71" cy="56" r="2.8" />
        <ellipse className="pet-fawn-mouth-fill" cx="62" cy="67" rx="4" ry="5" />
      </>
    );
  }

  if (runtimeState.status === "needs_input") {
    return (
      <>
        <circle className="pet-fawn-eye" cx="53" cy="55" r="3" />
        <circle className="pet-fawn-eye" cx="71" cy="55" r="3" />
        <path className="pet-fawn-mouth" d="M57 66 C60 63 66 63 69 66" />
      </>
    );
  }

  if (runtimeState.form === "charged") {
    return (
      <>
        <path className="pet-fawn-brow pet-fawn-brow--focus" d="M46 51 L58 48" />
        <path className="pet-fawn-brow pet-fawn-brow--focus" d="M66 48 L78 51" />
        <circle className="pet-fawn-eye pet-fawn-eye--charged" cx="53" cy="56" r="3" />
        <circle className="pet-fawn-eye pet-fawn-eye--charged" cx="71" cy="56" r="3" />
        <path className="pet-fawn-mouth" d="M57 66 L69 66" />
      </>
    );
  }

  if (runtimeState.status === "celebrate") {
    return (
      <>
        <path className="pet-fawn-eye pet-fawn-eye--happy" d="M47 55 C50 51 55 51 58 55" />
        <path className="pet-fawn-eye pet-fawn-eye--happy" d="M66 55 C69 51 74 51 77 55" />
        <path className="pet-fawn-mouth pet-fawn-mouth--happy" d="M55 64 C60 71 68 71 73 64" />
      </>
    );
  }

  return (
    <>
      <circle className="pet-fawn-eye" cx="53" cy="55" r="3.4" />
      <circle className="pet-fawn-eye" cx="71" cy="55" r="3.4" />
      <path className="pet-fawn-mouth" d="M57 65 C61 69 67 69 71 65" />
    </>
  );
}

function renderStatusBadge(runtimeState: PetRuntimeState) {
  if (runtimeState.status === "needs_input") {
    return (
      <g className="pet-fawn-badge pet-fawn-badge--leaf">
        <path d="M89 17 C103 17 110 28 104 40 C94 43 82 39 78 28 C81 21 84 18 89 17 Z" />
        <path className="pet-fawn-badge-vein" d="M83 30 C90 28 96 25 102 21" />
        <text x="91" y="36">?</text>
      </g>
    );
  }

  if (runtimeState.status === "needs_approval") {
    return (
      <g className="pet-fawn-badge pet-fawn-badge--apple">
        <path className="pet-fawn-apple-stem" d="M91 17 C92 13 95 11 99 12" />
        <path d="M89 21 C96 15 107 21 104 33 C101 45 91 48 86 40 C79 47 70 39 73 28 C75 19 83 17 89 21 Z" />
        <text x="89" y="38">!</text>
      </g>
    );
  }

  return null;
}

function renderStateDecor(runtimeState: PetRuntimeState) {
  if (runtimeState.form === "charged") {
    return (
      <g className="pet-fawn-charge">
        <ellipse cx="61" cy="56" rx="50" ry="37" />
        <path d="M60 10 C67 17 70 25 67 34 C58 30 55 20 60 10 Z" />
        <path d="M20 54 H33" />
        <path d="M88 54 H101" />
      </g>
    );
  }

  if (runtimeState.status === "working") {
    return (
      <g className="pet-fawn-work-lines">
        <path d="M28 88 H47" />
        <path d="M34 95 H55" />
        <path d="M74 89 H91" />
      </g>
    );
  }

  if (runtimeState.status === "celebrate") {
    return (
      <g className="pet-fawn-particles">
        <circle cx="26" cy="28" r="3" />
        <circle cx="96" cy="66" r="2.8" />
        <path d="M30 75 L21 83" />
        <path d="M99 19 L108 12" />
        <path d="M17 56 L28 52" />
      </g>
    );
  }

  if (runtimeState.status === "sleep") {
    return (
      <g className="pet-fawn-sleep-mark">
        <text x="88" y="29">Zz</text>
      </g>
    );
  }

  return null;
}

export function SnowFawnPet({ runtimeState }: SnowFawnPetProps) {
  return (
    <svg
      className="pet-fawn-svg"
      viewBox="0 0 120 120"
      role="img"
      aria-label="Snow Fawn"
      focusable="false"
    >
      <defs>
        <radialGradient id="snow-fawn-halo" cx="50%" cy="44%" r="64%">
          <stop offset="0%" stopColor="#fffdfa" stopOpacity="0.94" />
          <stop offset="48%" stopColor="#d8fff0" stopOpacity="0.46" />
          <stop offset="100%" stopColor="#12352a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="snow-fawn-coat" x1="38" y1="21" x2="82" y2="92">
          <stop offset="0%" stopColor="#fffdf4" />
          <stop offset="44%" stopColor="#f5d9b4" />
          <stop offset="100%" stopColor="#b98754" />
        </linearGradient>
        <linearGradient id="snow-fawn-ear" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff8ec" />
          <stop offset="100%" stopColor="#d9967b" />
        </linearGradient>
        <linearGradient id="snow-fawn-antler" x1="37" y1="8" x2="82" y2="38">
          <stop offset="0%" stopColor="#fff8df" />
          <stop offset="58%" stopColor="#cfa46f" />
          <stop offset="100%" stopColor="#7f5a36" />
        </linearGradient>
        <linearGradient id="snow-fawn-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#efffd7" />
          <stop offset="100%" stopColor="#33ba75" />
        </linearGradient>
        <radialGradient id="snow-fawn-cheek" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#ffb7a6" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#ffb7a6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="snow-fawn-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff8c9" />
          <stop offset="48%" stopColor="#63f2d2" />
          <stop offset="100%" stopColor="#1c8d98" />
        </linearGradient>
        <filter id="snow-fawn-shadow" x="-35%" y="-32%" width="170%" height="174%">
          <feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="#133023" floodOpacity="0.3" />
        </filter>
      </defs>

      <ellipse className="pet-fawn-halo" cx="60" cy="57" rx="49" ry="43" />
      <g className="pet-fawn-snow">
        <circle cx="22" cy="35" r="2" />
        <circle cx="93" cy="31" r="1.9" />
        <circle cx="102" cy="82" r="1.7" />
        <circle cx="21" cy="88" r="1.5" />
      </g>
      <g className="pet-fawn-leaves">
        <path d="M22 69 C12 59 16 45 31 43 C37 56 33 65 22 69 Z" />
        <path d="M97 72 C110 65 109 50 95 46 C87 57 88 68 97 72 Z" />
      </g>

      <g className="pet-fawn-body" filter="url(#snow-fawn-shadow)">
        <g className="pet-fawn-antlers">
          <path className="pet-fawn-antler pet-fawn-antler--left" d="M48 27 C39 17 35 11 31 7" />
          <path className="pet-fawn-antler pet-fawn-antler--left" d="M39 17 C34 16 30 18 27 22" />
          <path className="pet-fawn-antler pet-fawn-antler--left" d="M36 13 C35 8 36 5 39 2" />
          <path className="pet-fawn-antler pet-fawn-antler--right" d="M74 27 C83 17 87 11 91 7" />
          <path className="pet-fawn-antler pet-fawn-antler--right" d="M83 17 C88 16 92 18 95 22" />
          <path className="pet-fawn-antler pet-fawn-antler--right" d="M86 13 C87 8 86 5 83 2" />
        </g>
        <ellipse className="pet-fawn-torso" cx="60" cy="78" rx="31" ry="23" />
        <path className="pet-fawn-belly" d="M44 77 C49 93 69 99 82 84 C75 95 51 96 44 77 Z" />
        <path className="pet-fawn-leg" d="M43 88 C39 95 39 101 46 102 C51 98 50 91 47 86 Z" />
        <path className="pet-fawn-leg" d="M73 87 C70 95 72 101 79 101 C84 96 82 90 78 85 Z" />
        <path className="pet-fawn-hoof" d="M41 99 C43 103 48 104 51 100" />
        <path className="pet-fawn-hoof" d="M75 99 C78 103 83 103 85 98" />
        <path className="pet-fawn-tail" d="M87 72 C99 66 101 79 91 82" />
        <path className="pet-fawn-ear pet-fawn-ear--left" d="M43 38 C30 25 30 12 48 24 C51 30 50 36 43 38 Z" />
        <path className="pet-fawn-ear pet-fawn-ear--right" d="M78 38 C91 25 91 12 73 24 C70 30 71 36 78 38 Z" />
        <path className="pet-fawn-head" d="M61 22 C80 23 90 38 85 57 C82 76 68 84 55 78 C41 72 35 58 38 43 C40 30 49 22 61 22 Z" />
        <path className="pet-fawn-forehead-shine" d="M51 31 C57 26 68 27 75 34" />
        <path className="pet-fawn-muzzle" d="M49 60 C54 51 69 51 75 60 C75 72 67 78 57 75 C50 73 46 67 49 60 Z" />
        <path className="pet-fawn-nose" d="M57 60 C60 57 65 57 68 60 C67 64 63 66 59 65 C57 64 56 62 57 60 Z" />
        <path className="pet-fawn-blaze" d="M61 25 C66 37 65 45 61 52 C56 45 56 37 61 25 Z" />
        <ellipse className="pet-fawn-cheek pet-fawn-cheek--left" cx="48" cy="61" rx="7" ry="4.4" />
        <ellipse className="pet-fawn-cheek pet-fawn-cheek--right" cx="76" cy="61" rx="7" ry="4.4" />
        <g className="pet-fawn-spots">
          <circle cx="48" cy="75" r="2.1" />
          <circle cx="57" cy="83" r="1.8" />
          <circle cx="75" cy="75" r="2" />
          <circle cx="69" cy="86" r="1.6" />
        </g>
        <g className="pet-fawn-bow">
          <path d="M54 34 C43 29 39 38 50 43 L59 38 Z" />
          <path d="M66 34 C77 29 81 38 70 43 L61 38 Z" />
          <circle cx="60" cy="38" r="4" />
        </g>
        <g className="pet-fawn-collar">
          <path d="M47 75 C55 83 68 84 77 76" />
          <path className="pet-fawn-collar-gem" d="M60 79 L65 84 L60 90 L55 84 Z" />
        </g>
        {renderFace(runtimeState)}
        {renderStateDecor(runtimeState)}
      </g>

      {renderStatusBadge(runtimeState)}
    </svg>
  );
}
