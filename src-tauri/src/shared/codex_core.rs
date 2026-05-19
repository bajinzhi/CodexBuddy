use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::sync::oneshot::error::TryRecvError;
use tokio::sync::{oneshot, Mutex};
use tokio::time::timeout;
use tokio::time::Instant;

use crate::backend::app_server::WorkspaceSession;
use crate::codex::config as codex_config;
use crate::codex::home::{resolve_default_codex_home, resolve_workspace_codex_home};
use crate::rules;
use crate::shared::account::{build_account_response, read_auth_account};
use crate::types::WorkspaceEntry;

const LOGIN_START_TIMEOUT: Duration = Duration::from_secs(30);
#[allow(dead_code)]
const MAX_INLINE_IMAGE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_IMAGE_ATTACHMENT_BYTES: u64 = 20 * 1024 * 1024;
const MAX_DATA_ATTACHMENT_BYTES: u64 = 50 * 1024 * 1024;
const MAX_DOCUMENT_ATTACHMENT_BYTES: u64 = 512 * 1024 * 1024;
const THREAD_LIST_SOURCE_KINDS: &[&str] = &[
    "cli",
    "vscode",
    "appServer",
    "subAgentReview",
    "subAgentCompact",
    "subAgentThreadSpawn",
    "unknown",
];

#[allow(dead_code)]
fn image_extension_for_path(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

#[allow(dead_code)]
fn image_mime_type_for_path(path: &str) -> Option<&'static str> {
    let extension = image_extension_for_path(path)?;
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "tiff" | "tif" => Some("image/tiff"),
        _ => None,
    }
}

fn file_extension_for_path(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

fn is_supported_document_extension(extension: &str) -> bool {
    matches!(
        extension,
        "pdf"
            | "txt"
            | "md"
            | "markdown"
            | "json"
            | "jsonl"
            | "yaml"
            | "yml"
            | "xml"
            | "html"
            | "htm"
            | "docx"
            | "pptx"
            | "xlsx"
            | "xls"
            | "csv"
            | "tsv"
    )
}

fn is_supported_image_extension(extension: &str) -> bool {
    matches!(
        extension,
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tiff" | "tif" | "heic" | "heif"
    )
}

fn attachment_mime_for_extension(extension: &str) -> &'static str {
    match extension {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "tiff" | "tif" => "image/tiff",
        "heic" => "image/heic",
        "heif" => "image/heif",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" | "markdown" => "text/markdown",
        "json" | "jsonl" => "application/json",
        "yaml" | "yml" => "application/yaml",
        "xml" => "application/xml",
        "html" | "htm" => "text/html",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls" => "application/vnd.ms-excel",
        "csv" => "text/csv",
        "tsv" => "text/tab-separated-values",
        _ => "application/octet-stream",
    }
}

fn attachment_size_limit(extension: &str) -> u64 {
    if is_supported_image_extension(extension) {
        MAX_IMAGE_ATTACHMENT_BYTES
    } else if matches!(extension, "csv" | "tsv" | "xls" | "xlsx") {
        MAX_DATA_ATTACHMENT_BYTES
    } else {
        MAX_DOCUMENT_ATTACHMENT_BYTES
    }
}

fn validate_attachment_extension(
    name_or_path: &str,
) -> Result<(String, bool, &'static str), String> {
    let extension = file_extension_for_path(name_or_path)
        .ok_or_else(|| format!("Unsupported attachment without file extension: {name_or_path}"))?;
    if extension == "gdoc" {
        return Err(
            "Google Docs shortcut files (.gdoc) are not supported as attachments".to_string(),
        );
    }
    let is_image = is_supported_image_extension(&extension);
    if !is_image && !is_supported_document_extension(&extension) {
        return Err(format!("Unsupported attachment file type: .{extension}"));
    }
    let mime = attachment_mime_for_extension(&extension);
    Ok((extension, is_image, mime))
}

#[allow(dead_code)]
fn should_inline_image_path_for_codex(path: &str) -> bool {
    matches!(
        image_extension_for_path(path).as_deref(),
        Some("heic") | Some("heif")
    )
}

#[cfg(target_os = "macos")]
fn temp_converted_image_path(path: &str, extension: &str) -> PathBuf {
    let stem = Path::new(path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let safe_stem = stem
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    std::env::temp_dir().join(format!("codex-monitor-image-{safe_stem}-{ts}.{extension}"))
}

#[cfg(target_os = "macos")]
fn convert_heif_image_to_jpeg_bytes(path: &str) -> Result<Vec<u8>, String> {
    let output_path = temp_converted_image_path(path, "jpg");
    let status = std::process::Command::new("/usr/bin/sips")
        .args(["-s", "format", "jpeg"])
        .arg(path)
        .arg("--out")
        .arg(&output_path)
        .status()
        .map_err(|err| format!("Failed to launch HEIC/HEIF conversion for {path}: {err}"))?;
    if !status.success() {
        let _ = std::fs::remove_file(&output_path);
        return Err(format!(
            "Failed to convert HEIC/HEIF image into a Codex-compatible JPEG: {path}"
        ));
    }
    let bytes = std::fs::read(&output_path).map_err(|err| {
        format!(
            "Failed to read converted JPEG for {path} at {}: {err}",
            output_path.display()
        )
    })?;
    let _ = std::fs::remove_file(&output_path);
    if bytes.is_empty() {
        return Err(format!(
            "Converted JPEG is empty after HEIC/HEIF conversion: {path}"
        ));
    }
    Ok(bytes)
}

#[allow(dead_code)]
pub(crate) fn normalize_file_path(raw: &str) -> String {
    let path = raw.trim();
    let file_uri_path = path
        .strip_prefix("file://localhost")
        .or_else(|| path.strip_prefix("file://"));
    let Some(path) = file_uri_path else {
        return path.to_string();
    };

    let mut decoded = Vec::with_capacity(path.len());
    let bytes = path.as_bytes();
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hi = bytes[index + 1];
            let lo = bytes[index + 2];
            let hi_value = match hi {
                b'0'..=b'9' => Some(hi - b'0'),
                b'a'..=b'f' => Some(hi - b'a' + 10),
                b'A'..=b'F' => Some(hi - b'A' + 10),
                _ => None,
            };
            let lo_value = match lo {
                b'0'..=b'9' => Some(lo - b'0'),
                b'a'..=b'f' => Some(lo - b'a' + 10),
                b'A'..=b'F' => Some(lo - b'A' + 10),
                _ => None,
            };
            if let (Some(hi_nibble), Some(lo_nibble)) = (hi_value, lo_value) {
                decoded.push((hi_nibble << 4) | lo_nibble);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

#[allow(dead_code)]
pub(crate) fn read_image_as_data_url_core(path: &str) -> Result<String, String> {
    let trimmed_path = normalize_file_path(path);
    if trimmed_path.is_empty() {
        return Err("Image path is required".to_string());
    }
    if should_inline_image_path_for_codex(&trimmed_path) {
        #[cfg(target_os = "macos")]
        {
            let encoded = STANDARD.encode(convert_heif_image_to_jpeg_bytes(&trimmed_path)?);
            return Ok(format!("data:image/jpeg;base64,{encoded}"));
        }
        #[cfg(not(target_os = "macos"))]
        {
            return Err(format!(
                "HEIC/HEIF images are not supported on this platform; convert to JPEG or PNG first: {trimmed_path}"
            ));
        }
    }
    let mime_type = image_mime_type_for_path(&trimmed_path).ok_or_else(|| {
        format!("Unsupported or missing image extension for path: {trimmed_path}")
    })?;
    let metadata = std::fs::symlink_metadata(&trimmed_path)
        .map_err(|err| format!("Failed to stat image file at {trimmed_path}: {err}"))?;
    if metadata.file_type().is_symlink() {
        return Err(format!("Image path must not be a symlink: {trimmed_path}"));
    }
    if !metadata.is_file() {
        return Err(format!("Image path is not a file: {trimmed_path}"));
    }
    if metadata.len() > MAX_INLINE_IMAGE_BYTES {
        return Err(format!(
            "Image file exceeds maximum size of {MAX_INLINE_IMAGE_BYTES} bytes: {trimmed_path}"
        ));
    }
    let bytes = std::fs::read(&trimmed_path)
        .map_err(|err| format!("Failed to read image file at {trimmed_path}: {err}"))?;
    if bytes.is_empty() {
        return Err(format!("Image file is empty: {trimmed_path}"));
    }
    let encoded = STANDARD.encode(bytes);
    Ok(format!("data:{mime_type};base64,{encoded}"))
}

pub(crate) enum CodexLoginCancelState {
    PendingStart(oneshot::Sender<()>),
    LoginId(String),
}

async fn get_session_clone(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: &str,
) -> Result<Arc<WorkspaceSession>, String> {
    let sessions = sessions.lock().await;
    sessions
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| "workspace not connected".to_string())
}

async fn resolve_workspace_and_parent(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<(WorkspaceEntry, Option<WorkspaceEntry>), String> {
    let workspaces = workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| "workspace not found".to_string())?;
    let parent_entry = entry
        .parent_id
        .as_ref()
        .and_then(|parent_id| workspaces.get(parent_id))
        .cloned();
    Ok((entry, parent_entry))
}

async fn resolve_codex_home_for_workspace_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    let (entry, parent_entry) = resolve_workspace_and_parent(workspaces, workspace_id).await?;
    resolve_workspace_codex_home(&entry, parent_entry.as_ref())
        .or_else(resolve_default_codex_home)
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
}

async fn resolve_workspace_path_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<String, String> {
    let workspaces = workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .ok_or_else(|| "workspace not found".to_string())?;
    Ok(entry.path.clone())
}

pub(crate) async fn start_thread_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let workspace_path = resolve_workspace_path_core(workspaces, &workspace_id).await?;
    let params = json!({
        "cwd": workspace_path,
        "approvalPolicy": "on-request"
    });
    session
        .send_request_for_workspace(&workspace_id, "thread/start", params)
        .await
}

pub(crate) async fn resume_thread_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({ "threadId": thread_id });
    session
        .send_request_for_workspace(&workspace_id, "thread/resume", params)
        .await
}

pub(crate) async fn read_thread_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({ "threadId": thread_id });
    session
        .send_request_for_workspace(&workspace_id, "thread/read", params)
        .await
}

pub(crate) async fn thread_live_subscribe_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
) -> Result<(), String> {
    if thread_id.trim().is_empty() {
        return Err("threadId is required".to_string());
    }
    let _ = get_session_clone(sessions, &workspace_id).await?;
    Ok(())
}

pub(crate) async fn thread_live_unsubscribe_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
) -> Result<(), String> {
    if thread_id.trim().is_empty() {
        return Err("threadId is required".to_string());
    }
    let _ = get_session_clone(sessions, &workspace_id).await?;
    Ok(())
}

pub(crate) async fn fork_thread_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({ "threadId": thread_id });
    session
        .send_request_for_workspace(&workspace_id, "thread/fork", params)
        .await
}

pub(crate) async fn list_threads_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    sort_key: Option<String>,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({
        "cursor": cursor,
        "limit": limit,
        "sortKey": sort_key,
        // Keep interactive and sub-agent sessions visible across CLI versions so
        // thread/list refreshes do not drop valid historical conversations.
        // Intentionally exclude generic "subAgent" so parentless internal jobs
        // (for example memory consolidation) do not leak back into app state.
        "sourceKinds": THREAD_LIST_SOURCE_KINDS
    });
    session
        .send_request_for_workspace(&workspace_id, "thread/list", params)
        .await
}

pub(crate) async fn list_mcp_server_status_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({ "cursor": cursor, "limit": limit });
    session
        .send_request_for_workspace(&workspace_id, "mcpServerStatus/list", params)
        .await
}

pub(crate) async fn archive_thread_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({ "threadId": thread_id });
    session
        .send_request_for_workspace(&workspace_id, "thread/archive", params)
        .await
}

pub(crate) async fn compact_thread_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({ "threadId": thread_id });
    session
        .send_request_for_workspace(&workspace_id, "thread/compact/start", params)
        .await
}

pub(crate) async fn set_thread_name_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
    name: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({ "threadId": thread_id, "name": name });
    session
        .send_request_for_workspace(&workspace_id, "thread/name/set", params)
        .await
}

fn as_attachment_values(
    attachments: Option<Vec<Value>>,
    images: Option<Vec<String>>,
) -> Option<Vec<Value>> {
    if let Some(values) = attachments {
        if !values.is_empty() {
            return Some(values);
        }
    }
    images.map(|paths| paths.into_iter().map(Value::String).collect())
}

fn attachment_field<'a>(object: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    object
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn attachment_display_name(value: &Value, fallback: &str) -> String {
    if let Some(object) = value.as_object() {
        if let Some(name) = attachment_field(object, "name") {
            return name.to_string();
        }
    }
    let normalized = fallback.replace('\\', "/");
    normalized
        .rsplit('/')
        .find(|part| !part.trim().is_empty())
        .unwrap_or(fallback)
        .trim()
        .to_string()
}

fn safe_path_component(value: &str) -> String {
    let mut component = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    while component.contains("..") {
        component = component.replace("..", ".");
    }
    let component = component.trim_matches(['.', '-', '_']).to_string();
    if component.is_empty() {
        "attachment".to_string()
    } else {
        component
    }
}

fn attachment_cache_root(workspace_id: &str, thread_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join("codex-buddy-attachments")
        .join(safe_path_component(workspace_id))
        .join(safe_path_component(thread_id))
}

fn unique_attachment_path(root: &Path, index: usize, name: &str) -> PathBuf {
    let safe_name = safe_path_component(name);
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    root.join(format!("{ts}-{index}-{safe_name}"))
}

fn inline_attachment_value(value: &Value) -> Option<String> {
    match value {
        Value::String(raw) => Some(raw.trim().to_string()),
        Value::Object(object) => attachment_field(object, "dataUrl")
            .or_else(|| attachment_field(object, "url"))
            .or_else(|| attachment_field(object, "path"))
            .map(str::to_string),
        _ => None,
    }
    .filter(|raw| !raw.is_empty())
}

fn attachment_content_base64(value: &Value) -> Option<String> {
    value
        .as_object()
        .and_then(|object| attachment_field(object, "contentBase64"))
        .map(str::to_string)
}

fn copy_attachment_file(
    source_path: &str,
    workspace_id: &str,
    thread_id: &str,
    index: usize,
    name: &str,
    extension: &str,
) -> Result<(String, u64, PathBuf), String> {
    let normalized = normalize_file_path(source_path);
    let metadata = std::fs::symlink_metadata(&normalized)
        .map_err(|err| format!("Failed to stat attachment at {normalized}: {err}"))?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Attachment path must not be a symlink: {normalized}"
        ));
    }
    if !metadata.is_file() {
        return Err(format!("Attachment path is not a file: {normalized}"));
    }
    let size = metadata.len();
    let limit = attachment_size_limit(extension);
    if size == 0 {
        return Err(format!("Attachment file is empty: {normalized}"));
    }
    if size > limit {
        return Err(format!(
            "Attachment exceeds maximum size of {limit} bytes: {normalized}"
        ));
    }
    let root = attachment_cache_root(workspace_id, thread_id);
    std::fs::create_dir_all(&root)
        .map_err(|err| format!("Failed to create attachment cache: {err}"))?;
    let target = unique_attachment_path(&root, index, name);
    std::fs::copy(&normalized, &target).map_err(|err| {
        format!(
            "Failed to stage attachment from {normalized} to {}: {err}",
            target.display()
        )
    })?;
    Ok((target.display().to_string(), size, root))
}

fn write_inline_attachment_file(
    content_base64: &str,
    workspace_id: &str,
    thread_id: &str,
    index: usize,
    name: &str,
    extension: &str,
) -> Result<(String, u64, PathBuf), String> {
    let bytes = STANDARD
        .decode(content_base64)
        .map_err(|err| format!("Invalid attachment content for {name}: {err}"))?;
    let size = bytes.len() as u64;
    let limit = attachment_size_limit(extension);
    if bytes.is_empty() {
        return Err(format!("Attachment file is empty: {name}"));
    }
    if size > limit {
        return Err(format!(
            "Attachment exceeds maximum size of {limit} bytes: {name}"
        ));
    }
    let root = attachment_cache_root(workspace_id, thread_id);
    std::fs::create_dir_all(&root)
        .map_err(|err| format!("Failed to create attachment cache: {err}"))?;
    let target = unique_attachment_path(&root, index, name);
    std::fs::write(&target, bytes)
        .map_err(|err| format!("Failed to stage attachment {}: {err}", target.display()))?;
    Ok((target.display().to_string(), size, root))
}

fn build_file_attachment_line(name: &str, mime: &str, size: u64, path: &str) -> String {
    format!("- {name} ({mime}, {size} bytes): {path}")
}

fn process_attachment_value(
    value: Value,
    workspace_id: &str,
    thread_id: &str,
    index: usize,
    input: &mut Vec<Value>,
    file_lines: &mut Vec<String>,
    cache_roots: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let Some(raw_value) = inline_attachment_value(&value) else {
        return Ok(());
    };
    if raw_value.starts_with("data:image/") {
        input.push(json!({ "type": "image", "url": raw_value }));
        return Ok(());
    }
    if raw_value.starts_with("http://") || raw_value.starts_with("https://") {
        input.push(json!({ "type": "image", "url": raw_value }));
        return Ok(());
    }

    let name = attachment_display_name(&value, &raw_value);
    let (_, name_is_image, _name_mime) = validate_attachment_extension(&name)?;

    if name_is_image {
        let trimmed = raw_value.trim();
        if should_inline_image_path_for_codex(trimmed) {
            input.push(json!({
                "type": "image",
                "url": read_image_as_data_url_core(trimmed)?,
            }));
        } else {
            input.push(json!({ "type": "localImage", "path": normalize_file_path(trimmed) }));
        }
        return Ok(());
    }

    let (extension, _, mime) = validate_attachment_extension(&name)?;
    let (staged_path, size, root) = if let Some(content_base64) = attachment_content_base64(&value)
    {
        write_inline_attachment_file(
            &content_base64,
            workspace_id,
            thread_id,
            index,
            &name,
            &extension,
        )?
    } else {
        copy_attachment_file(
            &raw_value,
            workspace_id,
            thread_id,
            index,
            &name,
            &extension,
        )?
    };
    let mime = value
        .as_object()
        .and_then(|object| attachment_field(object, "mime"))
        .unwrap_or(mime);
    file_lines.push(build_file_attachment_line(&name, mime, size, &staged_path));
    cache_roots.push(root);
    Ok(())
}

pub(crate) fn prepare_attachments_for_remote(
    attachments: Option<Vec<Value>>,
) -> Result<Option<Vec<Value>>, String> {
    let Some(values) = attachments else {
        return Ok(None);
    };
    let mut prepared = Vec::with_capacity(values.len());
    for value in values {
        let Some(raw_value) = inline_attachment_value(&value) else {
            continue;
        };
        if raw_value.starts_with("data:")
            || raw_value.starts_with("http://")
            || raw_value.starts_with("https://")
        {
            prepared.push(value);
            continue;
        }
        let name = attachment_display_name(&value, &raw_value);
        let (extension, is_image, mime) = validate_attachment_extension(&name)?;
        if is_image {
            prepared.push(json!({
                "kind": "image",
                "name": name,
                "dataUrl": read_image_as_data_url_core(&raw_value)?,
            }));
            continue;
        }
        let normalized = normalize_file_path(&raw_value);
        let metadata = std::fs::symlink_metadata(&normalized)
            .map_err(|err| format!("Failed to stat attachment at {normalized}: {err}"))?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Attachment path must not be a symlink: {normalized}"
            ));
        }
        if !metadata.is_file() {
            return Err(format!("Attachment path is not a file: {normalized}"));
        }
        let limit = attachment_size_limit(&extension);
        if metadata.len() == 0 {
            return Err(format!("Attachment file is empty: {normalized}"));
        }
        if metadata.len() > limit {
            return Err(format!(
                "Attachment exceeds maximum size of {limit} bytes: {normalized}"
            ));
        }
        let bytes = std::fs::read(&normalized)
            .map_err(|err| format!("Failed to read attachment at {normalized}: {err}"))?;
        prepared.push(json!({
            "kind": "file",
            "name": name,
            "path": name,
            "mime": mime,
            "sizeBytes": bytes.len(),
            "contentBase64": STANDARD.encode(bytes),
        }));
    }
    Ok(Some(prepared))
}

struct BuiltTurnInput {
    input: Vec<Value>,
    attachment_roots: Vec<PathBuf>,
}

fn build_turn_input_items(
    workspace_id: &str,
    thread_id: &str,
    text: String,
    attachments: Option<Vec<Value>>,
    app_mentions: Option<Vec<Value>>,
) -> Result<BuiltTurnInput, String> {
    let trimmed_text = text.trim();
    let mut input: Vec<Value> = Vec::new();
    let mut file_lines: Vec<String> = Vec::new();
    let mut attachment_roots: Vec<PathBuf> = Vec::new();
    if !trimmed_text.is_empty() {
        input.push(json!({ "type": "text", "text": trimmed_text }));
    }
    if let Some(values) = attachments {
        for (index, value) in values.into_iter().enumerate() {
            process_attachment_value(
                value,
                workspace_id,
                thread_id,
                index,
                &mut input,
                &mut file_lines,
                &mut attachment_roots,
            )?;
        }
    }
    if !file_lines.is_empty() {
        let mut attachment_text = String::from(
            "Attached files are staged as local context. Read them from these paths when needed:\n",
        );
        attachment_text.push_str(&file_lines.join("\n"));
        input.push(json!({ "type": "text", "text": attachment_text }));
    }
    if let Some(mentions) = app_mentions {
        let mut seen_paths: HashSet<String> = HashSet::new();
        for mention in mentions {
            let object = mention
                .as_object()
                .ok_or_else(|| "invalid app mention payload".to_string())?;
            let name = object
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "invalid app mention name".to_string())?;
            let path = object
                .get("path")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "invalid app mention path".to_string())?;
            if !path.starts_with("app://") || path.len() <= "app://".len() {
                return Err("invalid app mention path".to_string());
            }
            if !seen_paths.insert(path.to_string()) {
                continue;
            }
            input.push(json!({ "type": "mention", "name": name, "path": path }));
        }
    }
    if input.is_empty() {
        return Err("empty user message".to_string());
    }
    attachment_roots.sort();
    attachment_roots.dedup();
    Ok(BuiltTurnInput {
        input,
        attachment_roots,
    })
}

fn attachment_requires_file_staging(value: &Value) -> Result<bool, String> {
    let Some(raw_value) = inline_attachment_value(value) else {
        return Ok(false);
    };
    if raw_value.starts_with("data:image/")
        || raw_value.starts_with("http://")
        || raw_value.starts_with("https://")
    {
        return Ok(false);
    }

    let name = attachment_display_name(value, &raw_value);
    let (_, is_image, _) = validate_attachment_extension(&name)?;
    Ok(!is_image)
}

fn attachments_require_file_staging(values: &[Value]) -> Result<bool, String> {
    for value in values {
        if attachment_requires_file_staging(value)? {
            return Ok(true);
        }
    }
    Ok(false)
}

pub(crate) fn insert_optional_nullable_string(
    params: &mut Map<String, Value>,
    key: &str,
    value: Option<Option<String>>,
) {
    if let Some(value) = value {
        params.insert(key.to_string(), json!(value));
    }
}

pub(crate) async fn send_user_message_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    thread_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
    service_tier: Option<Option<String>>,
    access_mode: Option<String>,
    images: Option<Vec<String>>,
    attachments: Option<Vec<Value>>,
    app_mentions: Option<Vec<Value>>,
    collaboration_mode: Option<Value>,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let workspace_path = resolve_workspace_path_core(workspaces, &workspace_id).await?;
    let access_mode = access_mode.unwrap_or_else(|| "current".to_string());
    let approval_policy = if access_mode == "full-access" {
        "never"
    } else {
        "on-request"
    };

    let built_input = build_turn_input_items(
        &workspace_id,
        &thread_id,
        text,
        as_attachment_values(attachments, images),
        app_mentions,
    )?;
    let mut writable_roots = vec![workspace_path.clone()];
    writable_roots.extend(
        built_input
            .attachment_roots
            .iter()
            .map(|path| path.display().to_string()),
    );
    let sandbox_policy = match access_mode.as_str() {
        "full-access" => json!({ "type": "dangerFullAccess" }),
        "read-only" => json!({ "type": "readOnly" }),
        _ => json!({
            "type": "workspaceWrite",
            "writableRoots": writable_roots,
            "networkAccess": true
        }),
    };

    let mut params = Map::new();
    params.insert("threadId".to_string(), json!(thread_id));
    params.insert("input".to_string(), json!(built_input.input));
    params.insert("cwd".to_string(), json!(workspace_path));
    params.insert("approvalPolicy".to_string(), json!(approval_policy));
    params.insert("sandboxPolicy".to_string(), json!(sandbox_policy));
    params.insert("model".to_string(), json!(model));
    params.insert("effort".to_string(), json!(effort));
    insert_optional_nullable_string(&mut params, "serviceTier", service_tier);
    if let Some(mode) = collaboration_mode {
        if !mode.is_null() {
            params.insert("collaborationMode".to_string(), mode);
        }
    }
    session
        .send_request_for_workspace(&workspace_id, "turn/start", Value::Object(params))
        .await
}

pub(crate) async fn turn_steer_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    text: String,
    images: Option<Vec<String>>,
    attachments: Option<Vec<Value>>,
    app_mentions: Option<Vec<Value>>,
) -> Result<Value, String> {
    if turn_id.trim().is_empty() {
        return Err("missing active turn id".to_string());
    }
    let attachment_values = as_attachment_values(attachments, images);
    if let Some(values) = attachment_values.as_ref() {
        if attachments_require_file_staging(values)? {
            return Err("file attachments cannot be sent to an active turn; queue the message so a new turn can read the staged files".to_string());
        }
    }
    let session = get_session_clone(sessions, &workspace_id).await?;
    let built_input = build_turn_input_items(
        &workspace_id,
        &thread_id,
        text,
        attachment_values,
        app_mentions,
    )?;
    let input = built_input.input;
    let params = json!({
        "threadId": thread_id,
        "expectedTurnId": turn_id,
        "input": input
    });
    session
        .send_request_for_workspace(&workspace_id, "turn/steer", params)
        .await
}

pub(crate) async fn collaboration_mode_list_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    session
        .send_request_for_workspace(&workspace_id, "collaborationMode/list", json!({}))
        .await
}

pub(crate) async fn turn_interrupt_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
    turn_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({ "threadId": thread_id, "turnId": turn_id });
    session
        .send_request_for_workspace(&workspace_id, "turn/interrupt", params)
        .await
}

pub(crate) async fn start_review_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    thread_id: String,
    target: Value,
    delivery: Option<String>,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let mut params = Map::new();
    params.insert("threadId".to_string(), json!(thread_id));
    params.insert("target".to_string(), target);
    if let Some(delivery) = delivery {
        params.insert("delivery".to_string(), json!(delivery));
    }
    session
        .send_request_for_workspace(&workspace_id, "review/start", Value::Object(params))
        .await
}

pub(crate) async fn model_list_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    session
        .send_request_for_workspace(&workspace_id, "model/list", json!({}))
        .await
}

pub(crate) async fn experimental_feature_list_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({ "cursor": cursor, "limit": limit });
    session
        .send_request_for_workspace(&workspace_id, "experimentalFeature/list", params)
        .await
}

pub(crate) async fn account_rate_limits_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    session
        .send_request_for_workspace(&workspace_id, "account/rateLimits/read", Value::Null)
        .await
}

pub(crate) async fn account_read_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    let session = {
        let sessions = sessions.lock().await;
        sessions.get(&workspace_id).cloned()
    };
    let response = if let Some(session) = session {
        session
            .send_request_for_workspace(&workspace_id, "account/read", Value::Null)
            .await
            .ok()
    } else {
        None
    };

    let (entry, parent_entry) = resolve_workspace_and_parent(workspaces, &workspace_id).await?;
    let codex_home = resolve_workspace_codex_home(&entry, parent_entry.as_ref())
        .or_else(resolve_default_codex_home);
    let fallback = read_auth_account(codex_home);

    Ok(build_account_response(response, fallback))
}

pub(crate) async fn codex_login_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    codex_login_cancels: &Mutex<HashMap<String, CodexLoginCancelState>>,
    workspace_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    {
        let mut cancels = codex_login_cancels.lock().await;
        if let Some(existing) = cancels.remove(&workspace_id) {
            match existing {
                CodexLoginCancelState::PendingStart(tx) => {
                    let _ = tx.send(());
                }
                CodexLoginCancelState::LoginId(_) => {}
            }
        }
        cancels.insert(
            workspace_id.clone(),
            CodexLoginCancelState::PendingStart(cancel_tx),
        );
    }

    let start = Instant::now();
    let mut cancel_rx = cancel_rx;
    let workspace_for_request = workspace_id.clone();
    let mut login_request: Pin<Box<_>> = Box::pin(session.send_request_for_workspace(
        &workspace_for_request,
        "account/login/start",
        json!({ "type": "chatgpt" }),
    ));

    let response = loop {
        match cancel_rx.try_recv() {
            Ok(_) => {
                let mut cancels = codex_login_cancels.lock().await;
                cancels.remove(&workspace_id);
                return Err("Codex login canceled.".to_string());
            }
            Err(TryRecvError::Closed) => {
                let mut cancels = codex_login_cancels.lock().await;
                cancels.remove(&workspace_id);
                return Err("Codex login canceled.".to_string());
            }
            Err(TryRecvError::Empty) => {}
        }

        let elapsed = start.elapsed();
        if elapsed >= LOGIN_START_TIMEOUT {
            let mut cancels = codex_login_cancels.lock().await;
            cancels.remove(&workspace_id);
            return Err("Codex login start timed out.".to_string());
        }

        let tick = Duration::from_millis(150);
        let remaining = LOGIN_START_TIMEOUT.saturating_sub(elapsed);
        let wait_for = remaining.min(tick);

        match timeout(wait_for, &mut login_request).await {
            Ok(result) => break result?,
            Err(_elapsed) => continue,
        }
    };

    let payload = response.get("result").unwrap_or(&response);
    let login_id = payload
        .get("loginId")
        .or_else(|| payload.get("login_id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "missing login id in account/login/start response".to_string())?;
    let auth_url = payload
        .get("authUrl")
        .or_else(|| payload.get("auth_url"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "missing auth url in account/login/start response".to_string())?;

    {
        let mut cancels = codex_login_cancels.lock().await;
        cancels.insert(
            workspace_id,
            CodexLoginCancelState::LoginId(login_id.clone()),
        );
    }

    Ok(json!({
        "loginId": login_id,
        "authUrl": auth_url,
        "raw": response,
    }))
}

pub(crate) async fn codex_login_cancel_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    codex_login_cancels: &Mutex<HashMap<String, CodexLoginCancelState>>,
    workspace_id: String,
) -> Result<Value, String> {
    let cancel_state = {
        let mut cancels = codex_login_cancels.lock().await;
        cancels.remove(&workspace_id)
    };

    let Some(cancel_state) = cancel_state else {
        return Ok(json!({ "canceled": false }));
    };

    match cancel_state {
        CodexLoginCancelState::PendingStart(cancel_tx) => {
            let _ = cancel_tx.send(());
            return Ok(json!({
                "canceled": true,
                "status": "canceled",
            }));
        }
        CodexLoginCancelState::LoginId(login_id) => {
            let session = get_session_clone(sessions, &workspace_id).await?;
            let response = session
                .send_request_for_workspace(
                    &workspace_id,
                    "account/login/cancel",
                    json!({
                        "loginId": login_id,
                    }),
                )
                .await?;

            let payload = response.get("result").unwrap_or(&response);
            let status = payload
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let canceled = status.eq_ignore_ascii_case("canceled");

            Ok(json!({
                "canceled": canceled,
                "status": status,
                "raw": response,
            }))
        }
    }
}

pub(crate) async fn skills_list_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let workspace_path = resolve_workspace_path_core(workspaces, &workspace_id).await?;

    // Codex can discover project-scoped skills from `<workspace>/.agents/skills`.
    // Some environments don't surface those reliably in CodexBuddy unless we
    // pass the default project skills path explicitly.
    let mut source_paths: Vec<String> = vec![];
    let project_skills_dir = Path::new(&workspace_path).join(".agents").join("skills");
    if project_skills_dir.is_dir() {
        if let Some(p) = project_skills_dir.to_str() {
            source_paths.push(p.to_string());
        }
    }

    let params = if source_paths.is_empty() {
        json!({ "cwd": workspace_path })
    } else {
        json!({ "cwd": workspace_path, "skillsPaths": source_paths })
    };

    let mut response = session
        .send_request_for_workspace(&workspace_id, "skills/list", params)
        .await?;

    // Attach diagnostics for the UI (non-breaking: keep original response fields).
    if let Value::Object(ref mut obj) = response {
        obj.insert("sourcePaths".to_string(), json!(source_paths));
        obj.insert("sourceErrors".to_string(), json!([]));
    }

    Ok(response)
}

pub(crate) async fn apps_list_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    thread_id: Option<String>,
) -> Result<Value, String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    let params = json!({ "cursor": cursor, "limit": limit, "threadId": thread_id });
    session
        .send_request_for_workspace(&workspace_id, "app/list", params)
        .await
}

pub(crate) async fn respond_to_server_request_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    request_id: Value,
    result: Value,
) -> Result<(), String> {
    let session = get_session_clone(sessions, &workspace_id).await?;
    session.send_response(request_id, result).await
}

pub(crate) async fn remember_approval_rule_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    command: Vec<String>,
) -> Result<Value, String> {
    let command = command
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    if command.is_empty() {
        return Err("empty command".to_string());
    }

    let codex_home = resolve_codex_home_for_workspace_core(workspaces, &workspace_id).await?;
    let rules_path = rules::default_rules_path(&codex_home);
    rules::append_prefix_rule(&rules_path, &command)?;

    Ok(json!({
        "ok": true,
        "rulesPath": rules_path,
    }))
}

pub(crate) async fn get_config_model_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    let codex_home = resolve_codex_home_for_workspace_core(workspaces, &workspace_id).await?;
    let model = codex_config::read_config_model(Some(codex_home))?;
    Ok(json!({ "model": model }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn normalize_strips_file_uri_prefix() {
        assert_eq!(
            normalize_file_path("file:///var/mobile/Containers/Data/photo.jpg"),
            "/var/mobile/Containers/Data/photo.jpg"
        );
    }

    #[test]
    fn normalize_strips_file_localhost_prefix() {
        assert_eq!(
            normalize_file_path("file://localhost/Users/test/image.png"),
            "/Users/test/image.png"
        );
    }

    #[test]
    fn normalize_decodes_percent_encoding() {
        assert_eq!(
            normalize_file_path("file:///var/mobile/path%20with%20spaces/img.jpg"),
            "/var/mobile/path with spaces/img.jpg"
        );
    }

    #[test]
    fn normalize_plain_path_unchanged() {
        assert_eq!(
            normalize_file_path("/var/mobile/Containers/Data/photo.jpg"),
            "/var/mobile/Containers/Data/photo.jpg"
        );
    }

    #[test]
    fn normalize_plain_path_percent_sequences_unchanged() {
        assert_eq!(
            normalize_file_path("/tmp/report%20final.png"),
            "/tmp/report%20final.png"
        );
    }

    #[test]
    fn normalize_trims_whitespace() {
        assert_eq!(normalize_file_path("  /tmp/image.png  "), "/tmp/image.png");
    }

    #[test]
    fn read_image_data_url_core_rejects_file_uri_that_does_not_exist() {
        let result = read_image_as_data_url_core("file:///nonexistent/photo.png");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            !err.contains("file://"),
            "error should reference normalized path, got: {err}"
        );
        assert!(err.contains("/nonexistent/photo.png"));
    }

    #[test]
    fn read_image_data_url_core_succeeds_with_file_uri_for_real_file() {
        let dir = std::env::temp_dir().join("codex_buddy_test");
        std::fs::create_dir_all(&dir).unwrap();
        let img_path = dir.join("test_photo.png");
        let png_bytes: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
            0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08,
            0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
            0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&img_path, png_bytes).unwrap();

        let file_uri = format!("file://{}", img_path.display());
        let result = read_image_as_data_url_core(&file_uri);
        assert!(
            result.is_ok(),
            "file:// URI for real file should succeed, got: {:?}",
            result.err()
        );
        let data_url = result.unwrap();
        assert!(data_url.starts_with("data:image/png;base64,"));

        let space_dir = dir.join("path with spaces");
        std::fs::create_dir_all(&space_dir).unwrap();
        let space_img = space_dir.join("photo.png");
        std::fs::write(&space_img, png_bytes).unwrap();
        let encoded_uri = format!(
            "file://{}",
            space_img.display().to_string().replace(' ', "%20")
        );
        let result2 = read_image_as_data_url_core(&encoded_uri);
        assert!(
            result2.is_ok(),
            "percent-encoded file:// URI should succeed, got: {:?}",
            result2.err()
        );

        let percent_img = dir.join("report%20final.png");
        std::fs::write(&percent_img, png_bytes).unwrap();
        let plain_percent_path = percent_img.display().to_string();
        let result3 = read_image_as_data_url_core(&plain_percent_path);
        assert!(
            result3.is_ok(),
            "plain filesystem paths with percent sequences should not be decoded, got: {:?}",
            result3.err()
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn heif_paths_are_inlined_for_codex() {
        assert!(should_inline_image_path_for_codex("/tmp/photo.heic"));
        assert!(should_inline_image_path_for_codex("/tmp/photo.HEIF"));
        assert!(!should_inline_image_path_for_codex("/tmp/photo.png"));
    }

    #[test]
    fn http_image_attachments_do_not_require_file_extensions() {
        let signed_url = "https://cdn.example.com/photo.png?sig=abc";
        let endpoint_url = "https://cdn.example.com/render?id=1";
        let built = build_turn_input_items(
            "workspace-1",
            "thread-1",
            "".to_string(),
            Some(vec![json!(signed_url), json!(endpoint_url)]),
            None,
        )
        .unwrap();

        assert!(built.attachment_roots.is_empty());
        assert_eq!(
            built.input,
            vec![
                json!({ "type": "image", "url": signed_url }),
                json!({ "type": "image", "url": endpoint_url }),
            ]
        );
    }

    #[test]
    fn turn_steer_rejects_file_attachments_before_staging() {
        let workspace_id = "workspace-steer-preflight";
        let thread_id = "thread-steer-preflight";
        let cache_root = attachment_cache_root(workspace_id, thread_id);
        let _ = std::fs::remove_dir_all(&cache_root);
        let sessions = Mutex::new(HashMap::new());
        let runtime = tokio::runtime::Runtime::new().unwrap();

        let result = runtime.block_on(turn_steer_core(
            &sessions,
            workspace_id.to_string(),
            thread_id.to_string(),
            "turn-1".to_string(),
            "review this".to_string(),
            None,
            Some(vec![json!({
                "name": "spec.pdf",
                "path": "spec.pdf",
                "contentBase64": STANDARD.encode(b"hello"),
            })]),
            None,
        ));

        let err = result.unwrap_err();
        assert!(err.contains("file attachments cannot be sent to an active turn"));
        assert!(
            !cache_root.exists(),
            "file attachments should be rejected before staging temp files"
        );
    }

    #[test]
    fn insert_optional_nullable_string_omits_missing_and_preserves_null() {
        let mut params = Map::new();

        insert_optional_nullable_string(&mut params, "serviceTier", None);
        assert!(!params.contains_key("serviceTier"));

        insert_optional_nullable_string(&mut params, "serviceTier", Some(None));
        assert_eq!(params.get("serviceTier"), Some(&Value::Null));

        insert_optional_nullable_string(&mut params, "serviceTier", Some(Some("fast".to_string())));
        assert_eq!(params.get("serviceTier"), Some(&json!("fast")));
    }

    #[test]
    fn thread_list_source_kinds_exclude_generic_subagent_and_keep_explicit_variants() {
        assert!(!THREAD_LIST_SOURCE_KINDS.contains(&"subAgent"));
        assert!(THREAD_LIST_SOURCE_KINDS.contains(&"subAgentReview"));
        assert!(THREAD_LIST_SOURCE_KINDS.contains(&"subAgentCompact"));
        assert!(THREAD_LIST_SOURCE_KINDS.contains(&"subAgentThreadSpawn"));
    }
}
