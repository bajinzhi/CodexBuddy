import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const tauriConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");
const tauriWindowsConfigPath = path.join(
  projectRoot,
  "src-tauri",
  "tauri.windows.conf.json",
);
const tauriCliEntry = path.join(
  projectRoot,
  "node_modules",
  "@tauri-apps",
  "cli",
  "tauri.js",
);

const mode = process.argv[2];
const extraArgs = process.argv.slice(3);

if (mode !== "build" && mode !== "dev") {
  console.error("Usage: node scripts/run-tauri-windows.mjs <build|dev> [...tauri args]");
  process.exit(1);
}

const shellProjectRoot = projectRoot.replace(/'/g, "''");
const overrideConfig = JSON.stringify({
  build: {
    beforeDevCommand:
      `powershell.exe -NoLogo -NoProfile -Command ` +
      `"Set-Location -LiteralPath '${shellProjectRoot}'; npm run dev"`,
    beforeBuildCommand:
      `powershell.exe -NoLogo -NoProfile -Command ` +
      `"Set-Location -LiteralPath '${shellProjectRoot}'; npm run build"`,
  },
});

const tauriArgs = [
  tauriCliEntry,
  mode,
  "--config",
  tauriConfigPath,
  "--config",
  tauriWindowsConfigPath,
  "--config",
  overrideConfig,
  ...extraArgs,
];

if (mode === "build" && !extraArgs.includes("--no-sign")) {
  tauriArgs.push("--no-sign");
}

const child = spawn(process.execPath, tauriArgs, {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
