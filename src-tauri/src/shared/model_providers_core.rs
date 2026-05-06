use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use toml_edit::{value, Document, Item, Table};

use crate::backend::app_server::WorkspaceSession;
use crate::codex::home::resolve_default_codex_home;
use crate::shared::config_toml_core;
use crate::shared::workspaces_core::{
    kill_all_workspace_sessions_core, list_active_workspace_sessions_core,
    ActiveWorkspaceSessionInfo,
};
use crate::types::WorkspaceEntry;

const CODEXBUDDY_TABLE: &str = "codex_buddy";
const MODEL_CATALOG_TABLE: &str = "model_catalog";
const PROVIDER_SECRETS_TABLE: &str = "provider_secrets";
const MODEL_PROVIDERS_TABLE: &str = "model_providers";
const DEFAULT_WIRE_API: &str = "responses";

const BUILT_IN_PROVIDERS: &[(&str, &str)] = &[
    ("openai", "OpenAI"),
    ("ollama", "Ollama"),
    ("lmstudio", "LM Studio"),
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderKeyValue {
    pub(crate) key: String,
    pub(crate) value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelProviderConfig {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) base_url: Option<String>,
    pub(crate) env_key: Option<String>,
    pub(crate) wire_api: String,
    #[serde(default)]
    pub(crate) models: Vec<String>,
    #[serde(default)]
    pub(crate) api_key: Option<String>,
    #[serde(default)]
    pub(crate) query_params: Vec<ProviderKeyValue>,
    #[serde(default)]
    pub(crate) http_headers: Vec<ProviderKeyValue>,
    #[serde(default)]
    pub(crate) env_http_headers: Vec<ProviderKeyValue>,
    #[serde(default)]
    pub(crate) request_max_retries: Option<u32>,
    #[serde(default)]
    pub(crate) stream_max_retries: Option<u32>,
    #[serde(default)]
    pub(crate) stream_idle_timeout_ms: Option<u64>,
    #[serde(default)]
    pub(crate) is_builtin: bool,
    #[serde(default)]
    pub(crate) is_reserved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelProviderSettings {
    pub(crate) active_provider_id: Option<String>,
    pub(crate) active_model: Option<String>,
    pub(crate) providers: Vec<ModelProviderConfig>,
    pub(crate) active_sessions: Vec<ActiveWorkspaceSessionInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveModelProviderSettingsInput {
    pub(crate) active_provider_id: Option<String>,
    pub(crate) active_model: Option<String>,
    pub(crate) providers: Vec<ModelProviderConfig>,
    #[serde(default)]
    pub(crate) restart_active_sessions: bool,
}

pub(crate) async fn get_model_provider_settings_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
) -> Result<ModelProviderSettings, String> {
    let root = resolve_config_root()?;
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    let mut settings = read_settings_from_document(&document);
    settings.active_sessions = list_active_workspace_sessions_core(workspaces, sessions).await;
    Ok(settings)
}

pub(crate) async fn save_model_provider_settings_core(
    input: SaveModelProviderSettingsInput,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
) -> Result<ModelProviderSettings, String> {
    validate_settings_input(&input)?;
    let root = resolve_config_root()?;
    let (_, mut document) = config_toml_core::load_global_config_document(&root)?;
    write_settings_to_document(&mut document, &input)?;
    config_toml_core::persist_global_config_document(&root, &document)?;

    if input.restart_active_sessions {
        kill_all_workspace_sessions_core(sessions).await;
    }

    get_model_provider_settings_core(workspaces, sessions).await
}

pub(crate) fn resolve_active_provider_secret(
    codex_home: Option<PathBuf>,
) -> Result<Option<(String, String)>, String> {
    let root = codex_home.or_else(resolve_default_codex_home);
    let Some(root) = root else {
        return Ok(None);
    };
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    let Some(provider_id) = config_toml_core::read_top_level_string(&document, "model_provider")
    else {
        return Ok(None);
    };
    let Some(api_key) = read_provider_secret(&document, provider_id.as_str()) else {
        return Ok(None);
    };
    let env_key = read_provider_env_key(&document, provider_id.as_str())
        .unwrap_or_else(|| generated_env_key(provider_id.as_str()));
    Ok(Some((env_key, api_key)))
}

fn resolve_config_root() -> Result<PathBuf, String> {
    resolve_default_codex_home().ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
}

fn read_settings_from_document(document: &Document) -> ModelProviderSettings {
    let active_provider_id = config_toml_core::read_top_level_string(document, "model_provider");
    let active_model = config_toml_core::read_top_level_string(document, "model");
    let mut providers = builtin_provider_configs();
    providers.extend(read_custom_providers(document));
    providers.sort_by(|left, right| {
        left.is_builtin
            .cmp(&right.is_builtin)
            .reverse()
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
            .then_with(|| left.id.cmp(&right.id))
    });
    ModelProviderSettings {
        active_provider_id,
        active_model,
        providers,
        active_sessions: Vec::new(),
    }
}

fn builtin_provider_configs() -> Vec<ModelProviderConfig> {
    BUILT_IN_PROVIDERS
        .iter()
        .map(|(id, name)| ModelProviderConfig {
            id: (*id).to_string(),
            name: (*name).to_string(),
            base_url: None,
            env_key: None,
            wire_api: DEFAULT_WIRE_API.to_string(),
            models: Vec::new(),
            api_key: None,
            query_params: Vec::new(),
            http_headers: Vec::new(),
            env_http_headers: Vec::new(),
            request_max_retries: None,
            stream_max_retries: None,
            stream_idle_timeout_ms: None,
            is_builtin: true,
            is_reserved: true,
        })
        .collect()
}

fn read_custom_providers(document: &Document) -> Vec<ModelProviderConfig> {
    let Some(providers_table) = document
        .get(MODEL_PROVIDERS_TABLE)
        .and_then(Item::as_table_like)
    else {
        return Vec::new();
    };

    providers_table
        .iter()
        .filter_map(|(provider_id, item)| {
            if is_reserved_provider_id(provider_id) {
                return None;
            }
            let table = item.as_table_like()?;
            let name =
                read_string_from_table(table, "name").unwrap_or_else(|| provider_id.to_string());
            Some(ModelProviderConfig {
                id: provider_id.to_string(),
                name,
                base_url: read_string_from_table(table, "base_url"),
                env_key: read_string_from_table(table, "env_key"),
                wire_api: read_string_from_table(table, "wire_api")
                    .unwrap_or_else(|| DEFAULT_WIRE_API.to_string()),
                models: read_provider_models(document, provider_id),
                api_key: read_provider_secret(document, provider_id),
                query_params: read_key_value_list(table.get("query_params")),
                http_headers: read_key_value_list(table.get("http_headers")),
                env_http_headers: read_key_value_list(table.get("env_http_headers")),
                request_max_retries: read_u32_from_table(table, "request_max_retries"),
                stream_max_retries: read_u32_from_table(table, "stream_max_retries"),
                stream_idle_timeout_ms: read_u64_from_table(table, "stream_idle_timeout_ms"),
                is_builtin: false,
                is_reserved: false,
            })
        })
        .collect()
}

fn read_string_from_table(table: &dyn toml_edit::TableLike, key: &str) -> Option<String> {
    table
        .get(key)
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn read_u32_from_table(table: &dyn toml_edit::TableLike, key: &str) -> Option<u32> {
    table
        .get(key)
        .and_then(Item::as_integer)
        .and_then(|value| u32::try_from(value).ok())
}

fn read_u64_from_table(table: &dyn toml_edit::TableLike, key: &str) -> Option<u64> {
    table
        .get(key)
        .and_then(Item::as_integer)
        .and_then(|value| u64::try_from(value).ok())
}

fn read_key_value_list(item: Option<&Item>) -> Vec<ProviderKeyValue> {
    let Some(table) = item.and_then(Item::as_table_like) else {
        return Vec::new();
    };
    table
        .iter()
        .filter_map(|(key, item)| {
            let value = item.as_str()?.trim();
            if key.trim().is_empty() || value.is_empty() {
                return None;
            }
            Some(ProviderKeyValue {
                key: key.to_string(),
                value: value.to_string(),
            })
        })
        .collect()
}

fn read_provider_models(document: &Document, provider_id: &str) -> Vec<String> {
    let Some(table) = document
        .get(CODEXBUDDY_TABLE)
        .and_then(Item::as_table_like)
        .and_then(|table| table.get(MODEL_CATALOG_TABLE))
        .and_then(Item::as_table_like)
        .and_then(|table| table.get(provider_id))
        .and_then(Item::as_table_like)
    else {
        return Vec::new();
    };
    table
        .get("models")
        .and_then(Item::as_array)
        .map(|models| {
            models
                .iter()
                .filter_map(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn read_provider_secret(document: &Document, provider_id: &str) -> Option<String> {
    document
        .get(CODEXBUDDY_TABLE)
        .and_then(Item::as_table_like)
        .and_then(|table| table.get(PROVIDER_SECRETS_TABLE))
        .and_then(Item::as_table_like)
        .and_then(|table| table.get(provider_id))
        .and_then(Item::as_table_like)
        .and_then(|table| table.get("api_key"))
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn read_provider_env_key(document: &Document, provider_id: &str) -> Option<String> {
    document
        .get(MODEL_PROVIDERS_TABLE)
        .and_then(Item::as_table_like)
        .and_then(|table| table.get(provider_id))
        .and_then(Item::as_table_like)
        .and_then(|table| table.get("env_key"))
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn write_settings_to_document(
    document: &mut Document,
    input: &SaveModelProviderSettingsInput,
) -> Result<(), String> {
    config_toml_core::set_top_level_string(
        document,
        "model_provider",
        input.active_provider_id.as_deref(),
    );
    config_toml_core::set_top_level_string(document, "model", input.active_model.as_deref());

    let desired_custom_ids = input
        .providers
        .iter()
        .filter(|provider| !provider.is_builtin && !is_reserved_provider_id(&provider.id))
        .map(|provider| normalize_provider_id(provider).to_string())
        .collect::<HashSet<_>>();

    remove_deleted_custom_providers(document, &desired_custom_ids)?;
    for provider in input
        .providers
        .iter()
        .filter(|provider| !provider.is_builtin && !is_reserved_provider_id(&provider.id))
    {
        write_custom_provider(document, provider)?;
    }
    Ok(())
}

fn remove_deleted_custom_providers(
    document: &mut Document,
    desired_custom_ids: &HashSet<String>,
) -> Result<(), String> {
    let mut deleted_custom_ids = Vec::new();
    {
        let Some(providers) = document
            .get_mut(MODEL_PROVIDERS_TABLE)
            .and_then(Item::as_table_mut)
        else {
            return Ok(());
        };
        let existing_custom_ids = providers
            .iter()
            .map(|(id, _)| id.to_string())
            .filter(|id| !is_reserved_provider_id(id))
            .collect::<Vec<_>>();
        for provider_id in existing_custom_ids {
            if !desired_custom_ids.contains(provider_id.as_str()) {
                let _ = providers.remove(provider_id.as_str());
                deleted_custom_ids.push(provider_id);
            }
        }
    }
    for provider_id in deleted_custom_ids {
        remove_codex_buddy_provider_data(document, provider_id.as_str());
    }
    Ok(())
}

fn remove_codex_buddy_provider_data(document: &mut Document, provider_id: &str) {
    remove_provider_from_codex_buddy_child_table(document, MODEL_CATALOG_TABLE, provider_id);
    remove_provider_from_codex_buddy_child_table(document, PROVIDER_SECRETS_TABLE, provider_id);
}

fn remove_provider_from_codex_buddy_child_table(
    document: &mut Document,
    child_table: &str,
    provider_id: &str,
) {
    if let Some(table) = document
        .get_mut(CODEXBUDDY_TABLE)
        .and_then(Item::as_table_mut)
        .and_then(|table| table.get_mut(child_table))
        .and_then(Item::as_table_mut)
    {
        let _ = table.remove(provider_id);
    }
}

fn write_custom_provider(
    document: &mut Document,
    provider: &ModelProviderConfig,
) -> Result<(), String> {
    let provider_id = normalize_provider_id(provider);
    {
        let providers = config_toml_core::ensure_table(document, MODEL_PROVIDERS_TABLE)?;
        let provider_table = ensure_child_table(providers, provider_id)?;
        set_table_string(provider_table, "name", Some(provider.name.as_str()));
        set_table_string(provider_table, "base_url", provider.base_url.as_deref());
        set_table_string(provider_table, "wire_api", Some(DEFAULT_WIRE_API));
        set_table_string(
            provider_table,
            "env_key",
            provider_env_key(provider).as_deref(),
        );
        set_table_u32(
            provider_table,
            "request_max_retries",
            provider.request_max_retries,
        );
        set_table_u32(
            provider_table,
            "stream_max_retries",
            provider.stream_max_retries,
        );
        set_table_u64(
            provider_table,
            "stream_idle_timeout_ms",
            provider.stream_idle_timeout_ms,
        );
        set_key_value_table(provider_table, "query_params", &provider.query_params)?;
        set_key_value_table(provider_table, "http_headers", &provider.http_headers)?;
        set_key_value_table(
            provider_table,
            "env_http_headers",
            &provider.env_http_headers,
        )?;
    }
    write_provider_models(document, provider_id, &provider.models)?;
    write_provider_secret(document, provider_id, provider.api_key.as_deref())?;
    Ok(())
}

fn ensure_child_table<'a>(parent: &'a mut Table, key: &str) -> Result<&'a mut Table, String> {
    if parent.get(key).is_none() {
        parent[key] = Item::Table(Table::new());
    }
    parent[key]
        .as_table_mut()
        .ok_or_else(|| format!("`{key}` must be a table in config.toml"))
}

fn set_table_string(table: &mut Table, key: &str, value_raw: Option<&str>) {
    let Some(value_raw) = value_raw else {
        let _ = table.remove(key);
        return;
    };
    let trimmed = value_raw.trim();
    if trimmed.is_empty() {
        let _ = table.remove(key);
        return;
    }
    table[key] = value(trimmed);
}

fn set_table_u32(table: &mut Table, key: &str, value_raw: Option<u32>) {
    if let Some(value_raw) = value_raw {
        table[key] = value(i64::from(value_raw));
    } else {
        let _ = table.remove(key);
    }
}

fn set_table_u64(table: &mut Table, key: &str, value_raw: Option<u64>) {
    if let Some(value_raw) = value_raw.and_then(|value| i64::try_from(value).ok()) {
        table[key] = value(value_raw);
    } else {
        let _ = table.remove(key);
    }
}

fn set_key_value_table(
    table: &mut Table,
    key: &str,
    values: &[ProviderKeyValue],
) -> Result<(), String> {
    let normalized = normalize_key_values(values)?;
    if normalized.is_empty() {
        let _ = table.remove(key);
        return Ok(());
    }
    let child = ensure_child_table(table, key)?;
    child.clear();
    for item in normalized {
        child[item.key.as_str()] = value(item.value.as_str());
    }
    Ok(())
}

fn write_provider_models(
    document: &mut Document,
    provider_id: &str,
    models: &[String],
) -> Result<(), String> {
    let catalog = ensure_codex_buddy_child_table(document, MODEL_CATALOG_TABLE)?;
    let provider_catalog = ensure_child_table(catalog, provider_id)?;
    let models = normalize_string_list(models);
    if models.is_empty() {
        let _ = provider_catalog.remove("models");
        return Ok(());
    }
    let mut array = toml_edit::Array::default();
    for model in models {
        array.push(model);
    }
    provider_catalog["models"] = value(array);
    Ok(())
}

fn write_provider_secret(
    document: &mut Document,
    provider_id: &str,
    api_key: Option<&str>,
) -> Result<(), String> {
    let trimmed = api_key.map(str::trim).filter(|value| !value.is_empty());
    let secrets = ensure_codex_buddy_child_table(document, PROVIDER_SECRETS_TABLE)?;
    if let Some(api_key) = trimmed {
        let provider_secrets = ensure_child_table(secrets, provider_id)?;
        provider_secrets["api_key"] = value(api_key);
    } else {
        let _ = secrets.remove(provider_id);
    }
    Ok(())
}

fn ensure_codex_buddy_child_table<'a>(
    document: &'a mut Document,
    key: &str,
) -> Result<&'a mut Table, String> {
    let codex_buddy = config_toml_core::ensure_table(document, CODEXBUDDY_TABLE)?;
    ensure_child_table(codex_buddy, key)
}

fn provider_env_key(provider: &ModelProviderConfig) -> Option<String> {
    let existing_env_key = provider
        .env_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let has_plaintext_key = provider
        .api_key
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty());
    if has_plaintext_key {
        Some(generated_env_key(normalize_provider_id(provider)))
    } else {
        existing_env_key
    }
}

fn normalize_provider_id(provider: &ModelProviderConfig) -> &str {
    provider.id.trim()
}

fn generated_env_key(provider_id: &str) -> String {
    let mut normalized = provider_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect::<String>();
    while normalized.contains("__") {
        normalized = normalized.replace("__", "_");
    }
    let normalized = normalized.trim_matches('_');
    let normalized = if normalized.is_empty() {
        "CUSTOM".to_string()
    } else {
        normalized.to_string()
    };
    format!("CODEXBUDDY_PROVIDER_{normalized}_API_KEY")
}

fn validate_settings_input(input: &SaveModelProviderSettingsInput) -> Result<(), String> {
    let provider_ids = input
        .providers
        .iter()
        .map(|provider| provider.id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect::<HashSet<_>>();
    if let Some(active_provider_id) = input.active_provider_id.as_deref() {
        let active_provider_id = active_provider_id.trim();
        if !active_provider_id.is_empty()
            && !provider_ids.contains(active_provider_id)
            && !is_reserved_provider_id(active_provider_id)
        {
            return Err(format!(
                "Unknown active model provider `{active_provider_id}`."
            ));
        }
    }

    let mut seen_ids = HashSet::new();
    let mut custom_provider_models = HashMap::new();
    for provider in input
        .providers
        .iter()
        .filter(|provider| !provider.is_builtin)
    {
        validate_provider(provider)?;
        let provider_id = normalize_provider_id(provider);
        if !seen_ids.insert(provider_id.to_ascii_lowercase()) {
            return Err(format!("Duplicate model provider `{}`.", provider.id));
        }
        custom_provider_models.insert(
            provider_id.to_string(),
            normalize_string_list(&provider.models),
        );
    }
    validate_active_model(input, &custom_provider_models)?;
    Ok(())
}

fn validate_active_model(
    input: &SaveModelProviderSettingsInput,
    custom_provider_models: &HashMap<String, Vec<String>>,
) -> Result<(), String> {
    let Some(active_model) = input
        .active_model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };
    let Some(active_provider_id) = input
        .active_provider_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };

    if let Some(models) = custom_provider_models.get(active_provider_id) {
        if models.iter().any(|model| model == active_model) {
            return Ok(());
        }
        return Err(format!(
            "Active model `{active_model}` is not listed for model provider `{active_provider_id}`."
        ));
    }

    if is_reserved_provider_id(active_provider_id) {
        if let Some((provider_id, _)) = custom_provider_models
            .iter()
            .find(|(_, models)| models.iter().any(|model| model == active_model))
        {
            return Err(format!(
                "Active model `{active_model}` belongs to custom model provider `{provider_id}`."
            ));
        }
    }

    Ok(())
}

fn validate_provider(provider: &ModelProviderConfig) -> Result<(), String> {
    let id = provider.id.trim();
    if id.is_empty() {
        return Err("Provider ID is required.".to_string());
    }
    if is_reserved_provider_id(id) {
        return Err(format!("`{id}` is a reserved provider ID."));
    }
    if id.len() > 64
        || !id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err(
            "Provider ID may only contain letters, numbers, dashes, and underscores.".into(),
        );
    }
    if provider.name.trim().is_empty() {
        return Err(format!("Provider `{id}` requires a display name."));
    }
    let base_url = provider.base_url.as_deref().unwrap_or("").trim();
    if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
        return Err(format!("Provider `{id}` requires an http(s) base URL."));
    }
    if provider.wire_api.trim() != DEFAULT_WIRE_API {
        return Err("Only Responses API providers are supported in this version.".to_string());
    }
    if normalize_string_list(&provider.models).is_empty() {
        return Err(format!("Provider `{id}` requires at least one model."));
    }
    let _ = normalize_key_values(&provider.query_params)?;
    let _ = normalize_key_values(&provider.http_headers)?;
    let _ = normalize_key_values(&provider.env_http_headers)?;
    Ok(())
}

fn normalize_key_values(values: &[ProviderKeyValue]) -> Result<Vec<ProviderKeyValue>, String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for item in values {
        let key = item.key.trim();
        let value = item.value.trim();
        if key.is_empty() && value.is_empty() {
            continue;
        }
        if key.is_empty() || value.is_empty() {
            return Err("Advanced provider fields require both key and value.".to_string());
        }
        if !seen.insert(key.to_ascii_lowercase()) {
            return Err(format!("Duplicate advanced provider key `{key}`."));
        }
        normalized.push(ProviderKeyValue {
            key: key.to_string(),
            value: value.to_string(),
        });
    }
    Ok(normalized)
}

fn normalize_string_list(values: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert(value.to_ascii_lowercase()))
        .map(str::to_string)
        .collect()
}

fn is_reserved_provider_id(provider_id: &str) -> bool {
    BUILT_IN_PROVIDERS
        .iter()
        .any(|(id, _)| id.eq_ignore_ascii_case(provider_id.trim()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(contents: &str) -> Document {
        config_toml_core::parse_document(contents).expect("parse config")
    }

    fn custom_provider(id: &str) -> ModelProviderConfig {
        ModelProviderConfig {
            id: id.to_string(),
            name: "Custom".to_string(),
            base_url: Some("https://models.example.com/v1".to_string()),
            env_key: None,
            wire_api: DEFAULT_WIRE_API.to_string(),
            models: vec!["custom-large".to_string()],
            api_key: Some("secret-key".to_string()),
            query_params: Vec::new(),
            http_headers: Vec::new(),
            env_http_headers: Vec::new(),
            request_max_retries: Some(2),
            stream_max_retries: None,
            stream_idle_timeout_ms: Some(300000),
            is_builtin: false,
            is_reserved: false,
        }
    }

    #[test]
    fn reads_custom_provider_and_plaintext_secret() {
        let document = parse(
            r#"
model_provider = "acme"
model = "acme-large"

[model_providers.acme]
name = "Acme"
base_url = "https://acme.example.com/v1"
env_key = "CODEXBUDDY_PROVIDER_ACME_API_KEY"
wire_api = "responses"

[codex_buddy.model_catalog.acme]
models = ["acme-large", "acme-small"]

[codex_buddy.provider_secrets.acme]
api_key = "sk-test"
"#,
        );

        let settings = read_settings_from_document(&document);
        let acme = settings
            .providers
            .iter()
            .find(|provider| provider.id == "acme")
            .expect("custom provider");

        assert_eq!(settings.active_provider_id.as_deref(), Some("acme"));
        assert_eq!(settings.active_model.as_deref(), Some("acme-large"));
        assert_eq!(acme.api_key.as_deref(), Some("sk-test"));
        assert_eq!(acme.models, vec!["acme-large", "acme-small"]);
    }

    #[test]
    fn writes_provider_without_dropping_unrelated_config() {
        let mut document = parse(
            r#"
personality = "friendly"

[features]
steer = true
"#,
        );
        let input = SaveModelProviderSettingsInput {
            active_provider_id: Some("acme".to_string()),
            active_model: Some("custom-large".to_string()),
            providers: vec![custom_provider("acme")],
            restart_active_sessions: false,
        };

        write_settings_to_document(&mut document, &input).expect("write provider");
        let rendered = document.to_string();

        assert!(rendered.contains("personality = \"friendly\""));
        assert!(rendered.contains("steer = true"));
        assert!(rendered.contains("model_provider = \"acme\""));
        assert!(rendered.contains("model = \"custom-large\""));
        assert!(rendered.contains("env_key = \"CODEXBUDDY_PROVIDER_ACME_API_KEY\""));
        assert!(rendered.contains("api_key = \"secret-key\""));
    }

    #[test]
    fn preserves_existing_external_env_key_without_plaintext_secret() {
        let mut document = parse(
            r#"
model_provider = "acme"
model = "acme-large"

[model_providers.acme]
name = "Acme"
base_url = "https://acme.example.com/v1"
env_key = "ACME_API_KEY"
wire_api = "responses"

[codex_buddy.model_catalog.acme]
models = ["acme-large"]
"#,
        );
        let settings = read_settings_from_document(&document);
        let input = SaveModelProviderSettingsInput {
            active_provider_id: settings.active_provider_id,
            active_model: settings.active_model,
            providers: settings.providers,
            restart_active_sessions: false,
        };

        write_settings_to_document(&mut document, &input).expect("write provider");

        assert_eq!(
            read_provider_env_key(&document, "acme").as_deref(),
            Some("ACME_API_KEY")
        );
        assert!(read_provider_secret(&document, "acme").is_none());
    }

    #[test]
    fn normalizes_provider_ids_before_writing_config() {
        let mut document = Document::new();
        let input = SaveModelProviderSettingsInput {
            active_provider_id: Some(" acme ".to_string()),
            active_model: Some("custom-large".to_string()),
            providers: vec![custom_provider(" acme ")],
            restart_active_sessions: false,
        };

        write_settings_to_document(&mut document, &input).expect("write provider");
        let settings = read_settings_from_document(&document);
        let custom_provider = settings
            .providers
            .iter()
            .find(|provider| provider.id == "acme")
            .expect("normalized custom provider");

        assert_eq!(settings.active_provider_id.as_deref(), Some("acme"));
        assert_eq!(custom_provider.id, "acme");
        assert_eq!(
            read_provider_env_key(&document, "acme").as_deref(),
            Some("CODEXBUDDY_PROVIDER_ACME_API_KEY")
        );
        assert_eq!(
            read_provider_secret(&document, "acme").as_deref(),
            Some("secret-key")
        );
        assert!(read_provider_env_key(&document, " acme ").is_none());
    }

    #[test]
    fn removes_deleted_provider_catalog_and_plaintext_secret() {
        let mut document = parse(
            r#"
model_provider = "keep"

[model_providers.acme]
name = "Acme"
base_url = "https://acme.example.com/v1"
wire_api = "responses"
env_key = "CODEXBUDDY_PROVIDER_ACME_API_KEY"

[model_providers.keep]
name = "Keep"
base_url = "https://keep.example.com/v1"
wire_api = "responses"
env_key = "CODEXBUDDY_PROVIDER_KEEP_API_KEY"

[codex_buddy.model_catalog.acme]
models = ["acme-large"]

[codex_buddy.model_catalog.keep]
models = ["keep-large"]

[codex_buddy.provider_secrets.acme]
api_key = "delete-me"

[codex_buddy.provider_secrets.keep]
api_key = "keep-me"
"#,
        );
        let input = SaveModelProviderSettingsInput {
            active_provider_id: Some("keep".to_string()),
            active_model: Some("keep-large".to_string()),
            providers: vec![custom_provider("keep")],
            restart_active_sessions: false,
        };

        write_settings_to_document(&mut document, &input).expect("write provider");

        assert!(read_provider_secret(&document, "acme").is_none());
        assert!(read_provider_models(&document, "acme").is_empty());
        assert_eq!(
            read_provider_secret(&document, "keep").as_deref(),
            Some("secret-key")
        );
        assert_eq!(
            read_provider_models(&document, "keep"),
            vec!["custom-large"]
        );
    }

    #[test]
    fn rejects_reserved_provider_id() {
        let input = SaveModelProviderSettingsInput {
            active_provider_id: Some("openai".to_string()),
            active_model: None,
            providers: vec![custom_provider("openai")],
            restart_active_sessions: false,
        };

        let error = validate_settings_input(&input).expect_err("reserved id");
        assert!(error.contains("reserved"));
    }

    #[test]
    fn rejects_active_custom_provider_model_outside_catalog() {
        let input = SaveModelProviderSettingsInput {
            active_provider_id: Some("acme".to_string()),
            active_model: Some("other-model".to_string()),
            providers: vec![custom_provider("acme")],
            restart_active_sessions: false,
        };

        let error = validate_settings_input(&input).expect_err("model mismatch");
        assert!(error.contains("not listed"));
    }

    #[test]
    fn rejects_custom_catalog_model_for_builtin_provider() {
        let input = SaveModelProviderSettingsInput {
            active_provider_id: Some("openai".to_string()),
            active_model: Some("custom-large".to_string()),
            providers: vec![custom_provider("acme")],
            restart_active_sessions: false,
        };

        let error = validate_settings_input(&input).expect_err("stale custom model");
        assert!(error.contains("belongs to custom model provider"));
    }

    #[test]
    fn allows_empty_active_model_for_custom_provider() {
        let input = SaveModelProviderSettingsInput {
            active_provider_id: Some("acme".to_string()),
            active_model: None,
            providers: vec![custom_provider("acme")],
            restart_active_sessions: false,
        };

        validate_settings_input(&input).expect("empty active model");
    }

    #[test]
    fn resolves_active_provider_secret() {
        let document = parse(
            r#"
model_provider = "acme"

[model_providers.acme]
env_key = "ACME_TOKEN"

[codex_buddy.provider_secrets.acme]
api_key = "plain-secret"
"#,
        );

        assert_eq!(
            read_provider_secret(&document, "acme").as_deref(),
            Some("plain-secret")
        );
        assert_eq!(
            read_provider_env_key(&document, "acme").as_deref(),
            Some("ACME_TOKEN")
        );
    }
}
