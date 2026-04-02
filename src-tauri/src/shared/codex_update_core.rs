#![allow(dead_code)]

use serde_json::Value;
use std::collections::HashMap;
use std::env;
use std::io::ErrorKind;
#[cfg(target_os = "windows")]
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Mutex;
use tokio::time::timeout;

use crate::backend::app_server::{build_codex_path_env, check_codex_installation, WorkspaceSession};
use crate::shared::process_core::tokio_command;
#[cfg(target_os = "windows")]
use crate::shared::process_core::{build_cmd_c_command, resolve_windows_executable};
use crate::shared::workspaces_core::{
    kill_all_workspace_sessions_core, list_active_workspace_sessions_core,
    ActiveWorkspaceSessionInfo,
};
use crate::types::{AppSettings, WorkspaceEntry};

const BREW_PACKAGE: &str = "codex";
const NPM_PACKAGE: &str = "@openai/codex";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexUpdateResult {
    ok: bool,
    method: String,
    package: Option<String>,
    before_version: Option<String>,
    after_version: Option<String>,
    upgraded: bool,
    output: Option<String>,
    details: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexUpdateCheckResult {
    method: String,
    package: Option<String>,
    before_version: Option<String>,
    latest_version: Option<String>,
    can_update: bool,
    up_to_date: bool,
    active_session_count: usize,
    active_sessions: Vec<ActiveWorkspaceSessionInfo>,
    details: Option<String>,
}

struct UpdateEnvironment {
    resolved: Option<String>,
    path_env: Option<String>,
    before_version: Option<String>,
    method: String,
    package: Option<String>,
    latest_version: Option<String>,
    can_update: bool,
    up_to_date: bool,
    codex_looks_like_npm: bool,
    direct_npm_update_available: bool,
    details: Option<String>,
}

fn trim_lines(value: &str, max_len: usize) -> String {
    let trimmed = value.trim();
    if trimmed.len() <= max_len {
        return trimmed.to_string();
    }

    let mut shortened = trimmed[..max_len].to_string();
    shortened.push_str("…");
    shortened
}

fn build_codex_update_path_env(codex_bin: Option<&str>) -> Option<String> {
    let base = build_codex_path_env(codex_bin);

    #[cfg(target_os = "windows")]
    {
        let mut paths: Vec<PathBuf> = base
            .as_deref()
            .map(env::split_paths)
            .map(Iterator::collect)
            .unwrap_or_default();

        for candidate in [
            env::var("ProgramFiles")
                .ok()
                .map(|value| PathBuf::from(value).join("nodejs")),
            env::var("ProgramFiles(x86)")
                .ok()
                .map(|value| PathBuf::from(value).join("nodejs")),
        ]
        .into_iter()
        .flatten()
        {
            if !paths.iter().any(|path| path == &candidate) {
                paths.push(candidate);
            }
        }

        if paths.is_empty() {
            return None;
        }

        return env::join_paths(paths)
            .ok()
            .map(|joined| joined.to_string_lossy().to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        base
    }
}

fn combine_output(output: &std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    format!("{}\n{}", stdout.trim_end(), stderr.trim_end())
        .trim()
        .to_string()
}

fn build_package_manager_command(
    program: &str,
    args: &[&str],
    path_env: Option<&str>,
) -> Result<tokio::process::Command, String> {
    #[cfg(target_os = "windows")]
    {
        let command_args: Vec<String> = args.iter().map(|value| (*value).to_string()).collect();
        let resolved = resolve_windows_executable(program, path_env);
        let resolved_path = resolved.as_deref().unwrap_or_else(|| Path::new(program));
        let ext = resolved_path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase());

        let mut command = if matches!(ext.as_deref(), Some("cmd") | Some("bat")) {
            let mut command = tokio_command("cmd");
            let command_line = build_cmd_c_command(resolved_path, &command_args)?;
            command.arg("/D");
            command.arg("/S");
            command.arg("/C");
            command.raw_arg(command_line);
            command
        } else {
            let mut command = tokio_command(resolved_path);
            command.args(&command_args);
            command
        };

        if let Some(path_env) = path_env {
            command.env("PATH", path_env);
        }
        Ok(command)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut command = tokio_command(program);
        command.args(args);
        if let Some(path_env) = path_env {
            command.env("PATH", path_env);
        }
        Ok(command)
    }
}

async fn run_probe_command(
    program: &str,
    args: &[&str],
    path_env: Option<&str>,
    timeout_duration: Duration,
) -> Result<Option<std::process::Output>, String> {
    let mut command = build_package_manager_command(program, args, path_env)?;
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    match timeout(timeout_duration, command.output()).await {
        Ok(result) => match result {
            Ok(output) => Ok(Some(output)),
            Err(err) => {
                if err.kind() == ErrorKind::NotFound {
                    return Ok(None);
                }
                Err(err.to_string())
            }
        },
        Err(_) => Ok(None),
    }
}

async fn run_captured_command(
    program: &str,
    args: &[&str],
    path_env: Option<&str>,
    timeout_duration: Duration,
    timeout_message: &str,
) -> Result<std::process::Output, String> {
    let mut command = build_package_manager_command(program, args, path_env)?;
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    match timeout(timeout_duration, command.output()).await {
        Ok(result) => result.map_err(|err| err.to_string()),
        Err(_) => Err(timeout_message.to_string()),
    }
}

async fn run_brew_check(args: &[&str], path_env: Option<&str>) -> Result<bool, String> {
    let Some(output) = run_probe_command("brew", args, path_env, Duration::from_secs(8)).await?
    else {
        return Ok(false);
    };

    Ok(output.status.success())
}

async fn detect_brew_cask(name: &str, path_env: Option<&str>) -> Result<bool, String> {
    run_brew_check(&["list", "--cask", "--versions", name], path_env).await
}

async fn detect_brew_formula(name: &str, path_env: Option<&str>) -> Result<bool, String> {
    run_brew_check(&["list", "--formula", "--versions", name], path_env).await
}

async fn run_brew_upgrade(args: &[&str], path_env: Option<&str>) -> Result<(bool, String), String> {
    let mut command_args = vec!["upgrade"];
    command_args.extend(args);

    let output = run_captured_command(
        "brew",
        &command_args,
        path_env,
        Duration::from_secs(60 * 10),
        "Timed out while running `brew upgrade`.",
    )
    .await?;

    Ok((output.status.success(), combine_output(&output)))
}

fn brew_output_indicates_upgrade(output: &str) -> bool {
    let lower = output.to_ascii_lowercase();
    if lower.contains("already up-to-date") {
        return false;
    }
    if lower.contains("already installed") && lower.contains("latest") {
        return false;
    }
    if lower.contains("upgraded") {
        return true;
    }
    if lower.contains("installing") || lower.contains("pouring") {
        return true;
    }
    false
}

#[cfg(target_os = "windows")]
fn path_ends_with_npm_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("npm"))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn is_windows_npm_shim_path(path: &Path) -> bool {
    let Some(parent) = path.parent() else {
        return false;
    };

    if let Ok(appdata) = std::env::var("APPDATA") {
        let expected = PathBuf::from(appdata).join("npm");
        if parent == expected {
            return true;
        }
    }

    path_ends_with_npm_dir(parent)
}

#[cfg(target_os = "windows")]
fn codex_bin_indicates_npm_install(codex_bin: Option<&str>, path_env: Option<&str>) -> bool {
    let resolved = codex_bin
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| {
            let unquoted = value
                .strip_prefix('"')
                .and_then(|trimmed| trimmed.strip_suffix('"'))
                .unwrap_or(value);
            if unquoted.contains('\\')
                || unquoted.contains('/')
                || matches!(unquoted.as_bytes().get(1), Some(b':'))
            {
                Some(PathBuf::from(unquoted))
            } else {
                None
            }
        })
        .filter(|path| path.is_file())
        .or_else(|| resolve_windows_executable(codex_bin.unwrap_or("codex").trim(), path_env));

    resolved
        .as_deref()
        .map(is_windows_npm_shim_path)
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn codex_bin_indicates_npm_install(_codex_bin: Option<&str>, _path_env: Option<&str>) -> bool {
    false
}

#[cfg(target_os = "windows")]
fn package_manager_command_available(program: &str, path_env: Option<&str>) -> bool {
    resolve_windows_executable(program, path_env).is_some()
}

#[cfg(not(target_os = "windows"))]
fn package_manager_command_available(_program: &str, _path_env: Option<&str>) -> bool {
    true
}

fn should_use_direct_npm_update(codex_bin: Option<&str>, path_env: Option<&str>) -> bool {
    codex_bin_indicates_npm_install(codex_bin, path_env)
        && package_manager_command_available("npm", path_env)
}

fn normalize_version_for_compare(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(json_string) = serde_json::from_str::<String>(trimmed) {
        return normalize_version_for_compare(&json_string);
    }

    let candidate = trimmed
        .split_whitespace()
        .last()
        .unwrap_or(trimmed)
        .trim()
        .trim_start_matches('v')
        .trim();
    if candidate.is_empty() {
        None
    } else {
        Some(candidate.to_string())
    }
}

fn installed_matches_latest(installed: Option<&str>, latest: Option<&str>) -> bool {
    match (installed, latest) {
        (Some(installed), Some(latest)) => {
            normalize_version_for_compare(installed) == normalize_version_for_compare(latest)
        }
        _ => false,
    }
}

async fn npm_has_package(package: &str, path_env: Option<&str>) -> Result<bool, String> {
    let Some(output) = run_probe_command(
        "npm",
        &["list", "-g", package, "--depth=0"],
        path_env,
        Duration::from_secs(10),
    )
    .await?
    else {
        return Ok(false);
    };

    Ok(output.status.success())
}

fn parse_npm_view_version_output(output: &std::process::Output) -> Option<String> {
    normalize_version_for_compare(String::from_utf8_lossy(&output.stdout).trim())
}

async fn npm_latest_version(package: &str, path_env: Option<&str>) -> Result<Option<String>, String> {
    let Some(output) = run_probe_command(
        "npm",
        &["view", package, "version", "--json"],
        path_env,
        Duration::from_secs(20),
    )
    .await?
    else {
        return Ok(None);
    };

    if !output.status.success() {
        return Ok(None);
    }

    Ok(parse_npm_view_version_output(&output))
}

async fn brew_package_is_outdated(
    package: &str,
    cask: bool,
    path_env: Option<&str>,
) -> Result<Option<bool>, String> {
    let args = if cask {
        vec!["outdated", "--quiet", "--cask", package]
    } else {
        vec!["outdated", "--quiet", "--formula", package]
    };
    let Some(output) = run_probe_command("brew", &args, path_env, Duration::from_secs(15)).await?
    else {
        return Ok(None);
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(Some(!stdout.trim().is_empty()))
}

fn npm_output_indicates_upgrade(output: &str) -> bool {
    let lower = output.to_ascii_lowercase();
    !lower.contains("up to date") && !lower.contains("up-to-date")
}

async fn run_npm_install_latest(
    package: &str,
    path_env: Option<&str>,
) -> Result<(bool, String), String> {
    let package_spec = format!("{package}@latest");
    let output = run_captured_command(
        "npm",
        &["install", "-g", &package_spec],
        path_env,
        Duration::from_secs(60 * 10),
        "Timed out while running `npm install -g`.",
    )
    .await?;

    Ok((output.status.success(), combine_output(&output)))
}

fn active_session_blocked_update_details(active_sessions: &[ActiveWorkspaceSessionInfo]) -> String {
    let names = active_sessions
        .iter()
        .take(5)
        .map(|session| session.workspace_name.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let remainder = active_sessions.len().saturating_sub(5);
    if names.is_empty() {
        return "Active Codex sessions are running. Confirm ending all sessions before updating."
            .to_string();
    }
    if remainder == 0 {
        return format!(
            "Active Codex sessions are running for: {names}. Confirm ending all sessions before updating."
        );
    }
    format!(
        "Active Codex sessions are running for: {names}, and {remainder} more. Confirm ending all sessions before updating."
    )
}

fn codex_binary_locked_update_details(output: &str) -> Option<String> {
    let lower = output.to_ascii_lowercase();
    if lower.contains("ebusy")
        && lower.contains("codex.exe")
        && (lower.contains("copyfile") || lower.contains("resource busy or locked"))
    {
        return Some(
            "Codex update failed because `codex.exe` is locked by another process. Close any external Codex terminals or sessions and retry."
                .to_string(),
        );
    }
    None
}

async fn inspect_update_environment(
    app_settings: &Mutex<AppSettings>,
    codex_bin: Option<String>,
    codex_args: Option<String>,
) -> Result<UpdateEnvironment, String> {
    let (default_bin, default_args) = {
        let settings = app_settings.lock().await;
        (settings.codex_bin.clone(), settings.codex_args.clone())
    };
    let resolved = codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_bin);
    let resolved_args = codex_args
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_args);
    let _ = resolved_args;
    let path_env = build_codex_update_path_env(resolved.as_deref());

    let before_version = check_codex_installation(resolved.clone())
        .await
        .ok()
        .flatten();

    let codex_looks_like_npm =
        codex_bin_indicates_npm_install(resolved.as_deref(), path_env.as_deref());
    let direct_npm_update_available =
        should_use_direct_npm_update(resolved.as_deref(), path_env.as_deref());

    let (method, package, can_update, details) = if direct_npm_update_available {
        ("npm".to_string(), Some(NPM_PACKAGE.to_string()), true, None)
    } else if codex_looks_like_npm {
        (
            "npm".to_string(),
            Some(NPM_PACKAGE.to_string()),
            false,
            Some(
                "Codex appears to be installed via npm, but `npm` is not available on PATH."
                    .to_string(),
            ),
        )
    } else if detect_brew_cask(BREW_PACKAGE, path_env.as_deref()).await? {
        (
            "brew_cask".to_string(),
            Some(BREW_PACKAGE.to_string()),
            true,
            None,
        )
    } else if detect_brew_formula(BREW_PACKAGE, path_env.as_deref()).await? {
        (
            "brew_formula".to_string(),
            Some(BREW_PACKAGE.to_string()),
            true,
            None,
        )
    } else if npm_has_package(NPM_PACKAGE, path_env.as_deref()).await? {
        ("npm".to_string(), Some(NPM_PACKAGE.to_string()), true, None)
    } else {
        (
            "unknown".to_string(),
            None,
            false,
            Some("Unable to detect Codex installation method (brew/npm).".to_string()),
        )
    };

    let (latest_version, up_to_date) = match method.as_str() {
        "npm" if can_update => {
            let latest_version = npm_latest_version(NPM_PACKAGE, path_env.as_deref()).await?;
            let up_to_date =
                installed_matches_latest(before_version.as_deref(), latest_version.as_deref());
            (latest_version, up_to_date)
        }
        "brew_cask" => (
            None,
            brew_package_is_outdated(BREW_PACKAGE, true, path_env.as_deref())
                .await?
                .map(|outdated| !outdated)
                .unwrap_or(false),
        ),
        "brew_formula" => (
            None,
            brew_package_is_outdated(BREW_PACKAGE, false, path_env.as_deref())
                .await?
                .map(|outdated| !outdated)
                .unwrap_or(false),
        ),
        _ => (None, false),
    };

    Ok(UpdateEnvironment {
        resolved,
        path_env,
        before_version,
        method,
        package,
        latest_version,
        can_update,
        up_to_date,
        codex_looks_like_npm,
        direct_npm_update_available,
        details,
    })
}

pub(crate) async fn codex_update_check_core(
    app_settings: &Mutex<AppSettings>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    codex_bin: Option<String>,
    codex_args: Option<String>,
) -> Result<Value, String> {
    let environment = inspect_update_environment(app_settings, codex_bin, codex_args).await?;
    let active_sessions = list_active_workspace_sessions_core(workspaces, sessions).await;

    let result = CodexUpdateCheckResult {
        method: environment.method,
        package: environment.package,
        before_version: environment.before_version,
        latest_version: environment.latest_version,
        can_update: environment.can_update,
        up_to_date: environment.up_to_date,
        active_session_count: active_sessions.len(),
        active_sessions,
        details: environment.details,
    };

    serde_json::to_value(result).map_err(|err| err.to_string())
}

pub(crate) async fn codex_update_core(
    app_settings: &Mutex<AppSettings>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    codex_bin: Option<String>,
    codex_args: Option<String>,
    kill_active_sessions: bool,
) -> Result<Value, String> {
    let environment = inspect_update_environment(app_settings, codex_bin, codex_args).await?;

    if !environment.can_update {
        let result = CodexUpdateResult {
            ok: false,
            method: environment.method,
            package: environment.package,
            before_version: environment.before_version,
            after_version: None,
            upgraded: false,
            output: None,
            details: environment.details,
        };
        return serde_json::to_value(result).map_err(|err| err.to_string());
    }

    if environment.up_to_date {
        let result = CodexUpdateResult {
            ok: true,
            method: environment.method,
            package: environment.package,
            before_version: environment.before_version.clone(),
            after_version: environment.before_version,
            upgraded: false,
            output: None,
            details: None,
        };
        return serde_json::to_value(result).map_err(|err| err.to_string());
    }

    let active_sessions = list_active_workspace_sessions_core(workspaces, sessions).await;
    if !active_sessions.is_empty() && !kill_active_sessions {
        let result = CodexUpdateResult {
            ok: false,
            method: environment.method,
            package: environment.package,
            before_version: environment.before_version,
            after_version: None,
            upgraded: false,
            output: None,
            details: Some(active_session_blocked_update_details(&active_sessions)),
        };
        return serde_json::to_value(result).map_err(|err| err.to_string());
    }

    if !active_sessions.is_empty() {
        kill_all_workspace_sessions_core(sessions).await;
        tokio::time::sleep(Duration::from_millis(300)).await;
    }

    let (upgrade_ok, output, upgraded) = match environment.method.as_str() {
        "npm" => {
            let (ok, output) =
                run_npm_install_latest(NPM_PACKAGE, environment.path_env.as_deref()).await?;
            let upgraded = ok && npm_output_indicates_upgrade(&output);
            (ok, output, upgraded)
        }
        "brew_cask" => {
            let (ok, output) =
                run_brew_upgrade(&["--cask", BREW_PACKAGE], environment.path_env.as_deref())
                    .await?;
            let upgraded = ok && brew_output_indicates_upgrade(&output);
            (ok, output, upgraded)
        }
        "brew_formula" => {
            let (ok, output) =
                run_brew_upgrade(&[BREW_PACKAGE], environment.path_env.as_deref()).await?;
            let upgraded = ok && brew_output_indicates_upgrade(&output);
            (ok, output, upgraded)
        }
        _ => (false, String::new(), false),
    };

    let after_version = match check_codex_installation(environment.resolved.clone()).await {
        Ok(version) => version,
        Err(err) => {
            let result = CodexUpdateResult {
                ok: false,
                method: environment.method,
                package: environment.package,
                before_version: environment.before_version,
                after_version: None,
                upgraded,
                output: Some(trim_lines(&output, 8000)),
                details: Some(err),
            };
            return serde_json::to_value(result).map_err(|e| e.to_string());
        }
    };

    let details = if upgrade_ok {
        None
    } else {
        codex_binary_locked_update_details(&output)
            .or_else(|| Some("Codex update failed.".to_string()))
    };

    let result = CodexUpdateResult {
        ok: upgrade_ok,
        method: environment.method,
        package: environment.package,
        before_version: environment.before_version,
        after_version,
        upgraded,
        output: Some(trim_lines(&output, 8000)),
        details,
    };

    serde_json::to_value(result).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brew_output_detects_upgrade_signals() {
        assert!(brew_output_indicates_upgrade("Upgraded 1 package"));
        assert!(brew_output_indicates_upgrade("Installing codex"));
        assert!(!brew_output_indicates_upgrade(
            "codex 0.118.0 already up-to-date"
        ));
        assert!(!brew_output_indicates_upgrade(
            "Warning: codex 0.118.0 is already installed and up-to-date"
        ));
    }

    #[test]
    fn normalize_version_for_compare_handles_codex_cli_versions() {
        assert_eq!(
            normalize_version_for_compare("codex-cli 0.118.0"),
            Some("0.118.0".to_string())
        );
        assert_eq!(
            normalize_version_for_compare("\"0.119.0\""),
            Some("0.119.0".to_string())
        );
        assert!(installed_matches_latest(
            Some("codex-cli 0.118.0"),
            Some("0.118.0")
        ));
    }

    #[cfg(target_os = "windows")]
    fn create_temp_test_dir(prefix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn codex_bin_detects_npm_shim_from_path_resolution() {
        let root = create_temp_test_dir("codex-update-npm");
        let npm_dir = root.join("npm");
        std::fs::create_dir_all(&npm_dir).expect("create npm dir");
        std::fs::write(npm_dir.join("codex.cmd"), "@echo off\r\nexit /b 0\r\n")
            .expect("write codex shim");
        let path_env = npm_dir.to_string_lossy().to_string();

        assert!(codex_bin_indicates_npm_install(None, Some(&path_env)));

        std::fs::remove_dir_all(root).expect("cleanup temp test dir");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn direct_npm_update_requires_npm_command_on_windows() {
        let root = create_temp_test_dir("codex-update-no-npm");
        let npm_dir = root.join("npm");
        std::fs::create_dir_all(&npm_dir).expect("create npm dir");
        std::fs::write(npm_dir.join("codex.cmd"), "@echo off\r\nexit /b 0\r\n")
            .expect("write codex shim");
        let path_env = npm_dir.to_string_lossy().to_string();

        assert!(codex_bin_indicates_npm_install(None, Some(&path_env)));
        assert!(!package_manager_command_available("npm", Some(&path_env)));
        assert!(!should_use_direct_npm_update(None, Some(&path_env)));

        std::fs::remove_dir_all(root).expect("cleanup temp test dir");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn npm_commands_support_cmd_wrappers_on_windows() {
        let root = create_temp_test_dir("codex-update-wrapper");
        let bin_dir = root.join("bin");
        std::fs::create_dir_all(&bin_dir).expect("create bin dir");
        std::fs::write(
            bin_dir.join("npm.cmd"),
            concat!(
                "@echo off\r\n",
                "if /I \"%~1\"==\"list\" goto list\r\n",
                "if /I \"%~1\"==\"view\" goto view\r\n",
                "if /I \"%~1\"==\"install\" goto install\r\n",
                "echo unexpected args: %* 1>&2\r\n",
                "exit /b 1\r\n",
                ":list\r\n",
                "if /I not \"%~2\"==\"-g\" exit /b 1\r\n",
                "if /I not \"%~3\"==\"@openai/codex\" exit /b 1\r\n",
                "if /I not \"%~4\"==\"--depth=0\" exit /b 1\r\n",
                "exit /b 0\r\n",
                ":view\r\n",
                "if /I not \"%~2\"==\"@openai/codex\" exit /b 1\r\n",
                "if /I not \"%~3\"==\"version\" exit /b 1\r\n",
                "if /I not \"%~4\"==\"--json\" exit /b 1\r\n",
                "echo \"0.119.0\"\r\n",
                "exit /b 0\r\n",
                ":install\r\n",
                "if /I not \"%~2\"==\"-g\" exit /b 1\r\n",
                "if /I not \"%~3\"==\"@openai/codex@latest\" exit /b 1\r\n",
                "echo updated\r\n",
                "exit /b 0\r\n",
            ),
        )
        .expect("write npm shim");
        let path_env = bin_dir.to_string_lossy().to_string();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build runtime");

        assert!(package_manager_command_available("npm", Some(&path_env)));
        assert!(!codex_bin_indicates_npm_install(None, Some(&path_env)));
        assert!(!should_use_direct_npm_update(None, Some(&path_env)));

        runtime.block_on(async {
            assert!(npm_has_package(NPM_PACKAGE, Some(&path_env))
                .await
                .expect("probe npm package"));
            assert_eq!(
                npm_latest_version(NPM_PACKAGE, Some(&path_env))
                    .await
                    .expect("probe npm latest version"),
                Some("0.119.0".to_string())
            );

            let (ok, output) = run_npm_install_latest(NPM_PACKAGE, Some(&path_env))
                .await
                .expect("run npm install");
            assert!(ok);
            assert_eq!(output, "updated");
        });

        std::fs::remove_dir_all(root).expect("cleanup temp test dir");
    }
}
