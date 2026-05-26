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
  console.error(
    "Usage: node scripts/run-tauri-windows.mjs <build|dev> [...tauri args]",
  );
  process.exit(1);
}

function normalizeDevInstanceId(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

function resolveDevPort() {
  const value = String(process.env.CODEXBUDDY_DEV_PORT ?? "").trim();
  if (!value) {
    return null;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid CODEXBUDDY_DEV_PORT: ${value}`);
    process.exit(1);
  }
  return port;
}

function powershellCommand(script) {
  return [
    "powershell.exe",
    "-NoLogo",
    "-NoProfile",
    "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64"),
  ].join(" ");
}

const shellProjectRoot = projectRoot.replace(/'/g, "''");
const devPort = mode === "dev" ? resolveDevPort() : null;
const devInstanceId =
  mode === "dev"
    ? normalizeDevInstanceId(process.env.CODEXBUDDY_DEV_INSTANCE_ID)
    : null;
const devHost =
  String(process.env.CODEXBUDDY_DEV_HOST ?? "127.0.0.1").trim() || "127.0.0.1";
const devCommand = devPort
  ? `npm run dev -- --host ${devHost} --port ${devPort} --strictPort`
  : "npm run dev";
const overrideConfig = JSON.stringify({
  build: {
    beforeDevCommand: powershellCommand(
      `Set-Location -LiteralPath '${shellProjectRoot}'; ${devCommand}`,
    ),
    beforeBuildCommand: powershellCommand(
      `Set-Location -LiteralPath '${shellProjectRoot}'; npm run build`,
    ),
    ...(devPort ? { devUrl: `http://${devHost}:${devPort}` } : {}),
  },
  ...(devInstanceId
    ? {
        identifier: `com.bajinzhi.codexbuddy.${devInstanceId}`,
        productName: `CodexBuddy ${devInstanceId}`,
      }
    : {}),
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
