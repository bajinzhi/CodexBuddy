import type { PetRuntimeState } from "@/features/pets/petRuntime";

type NeonCorePetProps = {
  runtimeState: PetRuntimeState;
};

type SignalLine = {
  x: number;
  y: number;
  width: number;
  delay: string;
};

const SIGNAL_LINES: SignalLine[] = [
  { x: 42, y: 83, width: 8, delay: "-0.1s" },
  { x: 54, y: 83, width: 15, delay: "-0.3s" },
  { x: 73, y: 83, width: 6, delay: "-0.2s" },
  { x: 47, y: 90, width: 24, delay: "-0.45s" },
];

function renderVisor(runtimeState: PetRuntimeState) {
  if (runtimeState.status === "sleep") {
    return (
      <path
        className="pet-core-visor-line pet-core-visor-line--sleep"
        d="M48 54 C54 57 66 57 72 54"
      />
    );
  }

  if (runtimeState.status === "needs_approval") {
    return (
      <>
        <path className="pet-core-visor-line pet-core-visor-line--alert" d="M47 53 L56 51" />
        <path className="pet-core-visor-line pet-core-visor-line--alert" d="M64 51 L73 53" />
        <circle className="pet-core-visor-dot" cx="60" cy="60" r="2.6" />
      </>
    );
  }

  if (runtimeState.status === "needs_input") {
    return (
      <>
        <circle className="pet-core-visor-dot" cx="52" cy="54" r="3" />
        <circle className="pet-core-visor-dot" cx="68" cy="54" r="3" />
        <path className="pet-core-visor-line" d="M55 62 C58 59 62 59 65 62" />
      </>
    );
  }

  if (runtimeState.form === "charged") {
    return (
      <>
        <path className="pet-core-visor-line pet-core-visor-line--focus" d="M45 53 L56 49" />
        <path className="pet-core-visor-line pet-core-visor-line--focus" d="M64 49 L75 53" />
        <path className="pet-core-visor-line pet-core-visor-line--focus" d="M52 61 L68 61" />
      </>
    );
  }

  if (runtimeState.status === "celebrate") {
    return (
      <>
        <path className="pet-core-visor-line pet-core-visor-line--happy" d="M46 53 C50 49 54 49 58 53" />
        <path className="pet-core-visor-line pet-core-visor-line--happy" d="M62 53 C66 49 70 49 74 53" />
        <path className="pet-core-visor-line pet-core-visor-line--happy" d="M52 61 C57 67 63 67 68 61" />
      </>
    );
  }

  return (
    <>
      <rect className="pet-core-visor-pixel" x="49" y="52" width="6" height="6" rx="2" />
      <rect className="pet-core-visor-pixel" x="65" y="52" width="6" height="6" rx="2" />
      <path className="pet-core-visor-line" d="M53 63 C57 66 63 66 67 63" />
    </>
  );
}

function renderStatusBadge(runtimeState: PetRuntimeState) {
  if (runtimeState.status === "needs_input") {
    return (
      <g className="pet-core-badge">
        <path d="M89 15 L106 22 L106 40 L89 47 L72 40 L72 22 Z" />
        <text x="89" y="36">?</text>
      </g>
    );
  }

  if (runtimeState.status === "needs_approval") {
    return (
      <g className="pet-core-badge pet-core-badge--danger">
        <path d="M89 15 L106 22 L106 40 L89 47 L72 40 L72 22 Z" />
        <text x="89" y="36">!</text>
      </g>
    );
  }

  if (runtimeState.status === "sleep") {
    return (
      <g className="pet-core-sleep-mark">
        <text x="86" y="28">Zz</text>
      </g>
    );
  }

  if (runtimeState.form === "charged") {
    return <path className="pet-core-bolt" d="M91 10 L80 37 L93 34 L85 58 L108 25 L95 29 Z" />;
  }

  return null;
}

function renderStateDecor(runtimeState: PetRuntimeState) {
  if (runtimeState.status === "working") {
    return (
      <g className="pet-core-terminal">
        <rect x="38" y="78" width="44" height="18" rx="5" />
        <path d="M45 87 L50 83 L45 79" />
        {SIGNAL_LINES.map((line) => (
          <rect
            key={`${line.x}-${line.width}`}
            x={line.x}
            y={line.y}
            width={line.width}
            height="2"
            rx="1"
            style={{ animationDelay: line.delay }}
          />
        ))}
      </g>
    );
  }

  if (runtimeState.status === "celebrate") {
    return (
      <g className="pet-core-particles">
        <circle cx="22" cy="25" r="3" />
        <circle cx="97" cy="64" r="3" />
        <path d="M31 72 L22 80" />
        <path d="M96 17 L105 10" />
        <path d="M17 55 L27 52" />
      </g>
    );
  }

  if (runtimeState.form === "charged") {
    return (
      <g className="pet-core-charge">
        <ellipse cx="60" cy="53" rx="49" ry="35" />
        <ellipse cx="60" cy="53" rx="57" ry="42" />
        <path d="M19 54 H32" />
        <path d="M88 54 H101" />
      </g>
    );
  }

  return null;
}

export function NeonCorePet({ runtimeState }: NeonCorePetProps) {
  return (
    <svg
      className="pet-core-svg"
      viewBox="0 0 120 120"
      role="img"
      aria-label="Neon Core"
      focusable="false"
    >
      <defs>
        <radialGradient id="neon-core-halo" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#31f7ff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0b1020" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="neon-core-shell" x1="35" y1="21" x2="86" y2="82">
          <stop offset="0%" stopColor="#ecffff" />
          <stop offset="36%" stopColor="#32f6ff" />
          <stop offset="68%" stopColor="#2268ff" />
          <stop offset="100%" stopColor="#131a3f" />
        </linearGradient>
        <linearGradient id="neon-core-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#dffcff" />
          <stop offset="45%" stopColor="#29eaff" />
          <stop offset="100%" stopColor="#2038ff" />
        </linearGradient>
        <filter id="neon-core-shadow" x="-35%" y="-30%" width="170%" height="170%">
          <feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="#00d5ff" floodOpacity="0.38" />
        </filter>
      </defs>
      <ellipse className="pet-core-halo" cx="60" cy="56" rx="48" ry="43" />
      <g className="pet-core-orbits">
        <ellipse className="pet-core-orbit pet-core-orbit--outer" cx="60" cy="54" rx="52" ry="36" />
        <ellipse className="pet-core-orbit pet-core-orbit--inner" cx="60" cy="54" rx="39" ry="28" />
      </g>
      <g className="pet-core-drone" filter="url(#neon-core-shadow)">
        <path className="pet-core-wing pet-core-wing--left" d="M35 44 L13 32 L17 55 L35 61 Z" />
        <path className="pet-core-wing pet-core-wing--right" d="M85 44 L107 32 L103 55 L85 61 Z" />
        <circle className="pet-core-wing-node" cx="18" cy="44" r="4" />
        <circle className="pet-core-wing-node" cx="102" cy="44" r="4" />
        <path className="pet-core-antenna" d="M52 26 L48 14" />
        <path className="pet-core-antenna" d="M68 26 L72 14" />
        <circle className="pet-core-antenna-dot" cx="48" cy="14" r="3" />
        <circle className="pet-core-antenna-dot" cx="72" cy="14" r="3" />
        <path className="pet-core-shell" d="M60 20 L86 35 L86 64 L60 82 L34 64 L34 35 Z" />
        <circle className="pet-core-lens" cx="60" cy="50" r="22" />
        <circle className="pet-core-lens-ring" cx="60" cy="50" r="15" />
        <circle className="pet-core-lens-core" cx="60" cy="50" r="8" />
        <path className="pet-core-shine" d="M47 34 C53 29 64 28 72 33" />
        <rect className="pet-core-visor" x="43" y="47" width="34" height="23" rx="10" />
        {renderVisor(runtimeState)}
        <g className="pet-core-thrusters">
          <path d="M48 79 L43 91 L53 86 Z" />
          <path d="M72 79 L67 86 L77 91 Z" />
        </g>
        {renderStateDecor(runtimeState)}
      </g>
      {renderStatusBadge(runtimeState)}
    </svg>
  );
}
