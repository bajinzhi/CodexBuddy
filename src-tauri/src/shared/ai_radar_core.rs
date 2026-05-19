use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::Duration;

use chrono::{DateTime, NaiveDateTime, Utc};
use futures_util::stream::{self, StreamExt};
use reqwest::Url;
use reqwest::header::{ACCEPT, CONTENT_TYPE, LOCATION};
use reqwest::redirect::Policy;
use reqwest::{Client, ClientBuilder};
use serde::{Deserialize, Serialize};
use tokio::fs;
use tokio::sync::Mutex;

use crate::shared::settings_core::{get_app_settings_core, update_app_settings_core};
use crate::types::{
    AiRadarChannel, AiRadarItem, AiRadarItemMetrics, AiRadarListResponse, AiRadarRefreshRequest,
    AiRadarSchedulerStatus, AiRadarSettings, AiRadarSource, AiRadarSourceKind, AiRadarSourceState,
    AiRadarStatus, AppSettings,
};

const CACHE_FILE_NAME: &str = "ai-radar-cache.json";
const USER_AGENT_VALUE: &str = "CodexBuddy AI Radar/1.0 (+https://github.com/openai/codex)";
const MAX_FETCH_BYTES: u64 = 2 * 1024 * 1024;
const HTTP_TIMEOUT_SECS: u64 = 30;
const MAX_REDIRECTS: usize = 5;
const DEFAULT_RSSHUB_BASE_URL: &str = "https://rsshub.chn.moe";
const GOOGLE_TRANSLATE_ENDPOINT: &str =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=";
const MAX_TRANSLATED_ITEMS_PER_SOURCE: usize = 20;
const MAX_TRANSLATION_CONCURRENCY: usize = 4;
const MAX_TRANSLATION_INPUT_CHARS: usize = 700;
const OPENROUTER_MODEL_RANKINGS_ACTION_NAME: &str = "getModelRankingsCached";

static TRANSLATION_BACKFILL_PATHS: OnceLock<StdMutex<HashSet<PathBuf>>> = OnceLock::new();
static CACHE_WRITE_LOCKS: OnceLock<StdMutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Default)]
struct AiRadarCache {
    #[serde(default)]
    items: Vec<AiRadarItem>,
    #[serde(default, rename = "sourceStates")]
    source_states: Vec<AiRadarSourceState>,
    #[serde(default, rename = "lastRefreshedAtMs")]
    last_refreshed_at_ms: Option<i64>,
}

struct ValidatedPublicUrl {
    url: Url,
    addrs: Vec<SocketAddr>,
}

#[derive(Debug, Deserialize)]
struct JsonFeed {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    items: Vec<JsonFeedItem>,
}

#[derive(Debug, Deserialize)]
struct JsonFeedItem {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default, rename = "external_url")]
    external_url: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default, rename = "content_text")]
    content_text: Option<String>,
    #[serde(default, rename = "date_published")]
    date_published: Option<String>,
    #[serde(default, rename = "date_modified")]
    date_modified: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubSearchResponse {
    #[serde(default)]
    items: Vec<GitHubRepository>,
}

#[derive(Debug, Deserialize)]
struct GitHubRepository {
    #[serde(default)]
    full_name: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    stargazers_count: i64,
    #[serde(default)]
    forks_count: i64,
    #[serde(default)]
    open_issues_count: i64,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    topics: Vec<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterRankingRow {
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    model_permaslug: String,
    #[serde(default)]
    variant: Option<String>,
    #[serde(default)]
    variant_permaslug: Option<String>,
    #[serde(default)]
    total_prompt_tokens: i64,
    #[serde(default)]
    total_completion_tokens: i64,
    #[serde(default)]
    total_native_tokens_reasoning: i64,
    #[serde(default)]
    count: i64,
    #[serde(default)]
    change: Option<f64>,
}

impl OpenRouterRankingRow {
    fn total_tokens(&self) -> i64 {
        self.total_prompt_tokens
            .saturating_add(self.total_completion_tokens)
            .saturating_add(self.total_native_tokens_reasoning)
    }

    fn variant_slug(&self) -> String {
        self.variant_permaslug
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_string()
    }
}

pub(crate) async fn ai_radar_list_core(
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
) -> Result<AiRadarListResponse, String> {
    let settings = normalize_runtime_settings(get_app_settings_core(app_settings).await.ai_radar);
    let cache_file = cache_path(settings_path);
    let cache = read_cache(&cache_file).await;
    if settings.translate_to_chinese && items_need_chinese_translation(&cache.items) {
        schedule_translation_backfill(cache_file);
    }
    Ok(build_response(settings, cache))
}

pub(crate) async fn ai_radar_refresh_core(
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
    request: AiRadarRefreshRequest,
) -> Result<AiRadarListResponse, String> {
    let settings = normalize_runtime_settings(get_app_settings_core(app_settings).await.ai_radar);
    let cache_file = cache_path(settings_path);
    let cache_lock = cache_write_lock(&cache_file);
    let _cache_guard = cache_lock.lock().await;
    let mut cache = read_cache(&cache_file).await;
    let now = now_ms();
    retain_active_cache_entries(&settings, &mut cache);
    let sources = selected_sources(&settings, &request);
    if sources.is_empty() {
        return Ok(build_response(settings, cache));
    }
    let previous_by_id = cache
        .items
        .iter()
        .map(|item| (item.id.clone(), item.clone()))
        .collect::<HashMap<_, _>>();
    let previous_last_refreshed_at_ms = cache.last_refreshed_at_ms;
    let client = build_client()?;
    let mut item_by_id = cache
        .items
        .into_iter()
        .map(|item| (item.id.clone(), item))
        .collect::<HashMap<_, _>>();
    let mut state_by_id = cache
        .source_states
        .into_iter()
        .map(|state| (state.source_id.clone(), state))
        .collect::<HashMap<_, _>>();

    for source in sources {
        let result = fetch_source(
            &client,
            &source,
            &previous_by_id,
            settings.translate_to_chinese,
            now,
        )
        .await;
        match result {
            Ok(items) => {
                let item_count = items.len() as u32;
                for item in items {
                    item_by_id.insert(item.id.clone(), item);
                }
                state_by_id.insert(
                    source.id.clone(),
                    AiRadarSourceState {
                        source_id: source.id.clone(),
                        source_name: source.name.clone(),
                        ok: true,
                        last_fetched_at_ms: Some(now),
                        last_error: None,
                        item_count,
                    },
                );
            }
            Err(err) => {
                state_by_id.insert(
                    source.id.clone(),
                    AiRadarSourceState {
                        source_id: source.id.clone(),
                        source_name: source.name.clone(),
                        ok: false,
                        last_fetched_at_ms: Some(now),
                        last_error: Some(err),
                        item_count: 0,
                    },
                );
            }
        }
    }

    cache = AiRadarCache {
        items: trim_items(&settings, item_by_id.into_values().collect(), now),
        source_states: state_by_id.into_values().collect(),
        last_refreshed_at_ms: if is_global_refresh(&request) {
            Some(now)
        } else {
            previous_last_refreshed_at_ms
        },
    };
    write_cache(&cache_file, &cache).await?;
    Ok(build_response(settings, cache))
}

fn is_global_refresh(request: &AiRadarRefreshRequest) -> bool {
    request.channel.is_none() && request.source_id.is_none()
}

fn cache_write_lock(path: &Path) -> Arc<Mutex<()>> {
    let mut locks = CACHE_WRITE_LOCKS
        .get_or_init(|| StdMutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    locks
        .entry(path.to_path_buf())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

pub(crate) async fn ai_radar_sources_get_core(
    app_settings: &Mutex<AppSettings>,
) -> AiRadarSettings {
    normalize_runtime_settings(get_app_settings_core(app_settings).await.ai_radar)
}

pub(crate) async fn ai_radar_sources_update_core(
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
    ai_radar: AiRadarSettings,
) -> Result<AiRadarSettings, String> {
    let mut settings = get_app_settings_core(app_settings).await;
    settings.ai_radar = sanitize_settings(ai_radar);
    update_app_settings_core(settings, app_settings, settings_path)
        .await
        .map(|settings| settings.ai_radar)
}

pub(crate) async fn ai_radar_scheduler_status_core(
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
) -> AiRadarSchedulerStatus {
    let settings = normalize_runtime_settings(get_app_settings_core(app_settings).await.ai_radar);
    let cache = read_cache(&cache_path(settings_path)).await;
    scheduler_status_for_cache(&settings, &cache, now_ms())
}

fn cache_path(settings_path: &Path) -> PathBuf {
    settings_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(CACHE_FILE_NAME)
}

async fn read_cache(path: &Path) -> AiRadarCache {
    match fs::read(path).await {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => AiRadarCache::default(),
    }
}

async fn write_cache(path: &Path, cache: &AiRadarCache) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|err| err.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(cache).map_err(|err| err.to_string())?;
    fs::write(path, bytes).await.map_err(|err| err.to_string())
}

fn build_response(settings: AiRadarSettings, mut cache: AiRadarCache) -> AiRadarListResponse {
    let now = now_ms();
    retain_active_cache_entries(&settings, &mut cache);
    cache.items = trim_items(&settings, cache.items, now);
    let status = build_status(&settings, &cache, now);
    AiRadarListResponse {
        settings,
        items: cache.items,
        status,
    }
}

fn retain_active_cache_entries(settings: &AiRadarSettings, cache: &mut AiRadarCache) {
    let active_source_ids = settings
        .sources
        .iter()
        .filter(|source| source.enabled)
        .map(|source| source.id.as_str())
        .collect::<HashSet<_>>();
    cache
        .items
        .retain(|item| active_source_ids.contains(item.source_id.as_str()));
    cache
        .source_states
        .retain(|state| active_source_ids.contains(state.source_id.as_str()));
}

fn build_status(settings: &AiRadarSettings, cache: &AiRadarCache, now: i64) -> AiRadarStatus {
    let status = scheduler_status_for_cache(settings, cache, now);
    let state_by_id = cache
        .source_states
        .iter()
        .map(|state| (state.source_id.as_str(), state.clone()))
        .collect::<HashMap<_, _>>();
    let source_states = settings
        .sources
        .iter()
        .filter(|source| source.enabled)
        .map(|source| {
            state_by_id
                .get(source.id.as_str())
                .cloned()
                .unwrap_or_else(|| AiRadarSourceState {
                    source_id: source.id.clone(),
                    source_name: source.name.clone(),
                    ok: false,
                    last_fetched_at_ms: None,
                    last_error: None,
                    item_count: 0,
                })
        })
        .collect();
    AiRadarStatus {
        last_refreshed_at_ms: status.last_refreshed_at_ms,
        next_refresh_at_ms: status.next_refresh_at_ms,
        stale: status.due,
        source_states,
    }
}

fn scheduler_status_for_cache(
    settings: &AiRadarSettings,
    cache: &AiRadarCache,
    now: i64,
) -> AiRadarSchedulerStatus {
    let mut status = scheduler_status(settings, cache.last_refreshed_at_ms, now);
    if settings.enabled && !status.due && has_unfetched_enabled_sources(settings, cache) {
        status.due = true;
    }
    status
}

fn has_unfetched_enabled_sources(settings: &AiRadarSettings, cache: &AiRadarCache) -> bool {
    let fetched_source_ids = cache
        .source_states
        .iter()
        .filter(|state| state.last_fetched_at_ms.is_some())
        .map(|state| state.source_id.as_str())
        .collect::<HashSet<_>>();
    settings
        .sources
        .iter()
        .filter(|source| source.enabled)
        .any(|source| !fetched_source_ids.contains(source.id.as_str()))
}

fn scheduler_status(
    settings: &AiRadarSettings,
    last_refreshed_at_ms: Option<i64>,
    now: i64,
) -> AiRadarSchedulerStatus {
    let interval_ms = (settings.refresh_interval_minutes.max(1) as i64) * 60 * 1000;
    let next_refresh_at_ms = last_refreshed_at_ms.map(|last| last + interval_ms);
    let due = settings.enabled
        && match next_refresh_at_ms {
            Some(next) => now >= next,
            None => true,
        };
    AiRadarSchedulerStatus {
        enabled: settings.enabled,
        refresh_interval_minutes: settings.refresh_interval_minutes,
        last_refreshed_at_ms,
        next_refresh_at_ms,
        due,
    }
}

fn selected_sources(
    settings: &AiRadarSettings,
    request: &AiRadarRefreshRequest,
) -> Vec<AiRadarSource> {
    settings
        .sources
        .iter()
        .filter(|source| source.enabled)
        .filter(|source| {
            request
                .channel
                .as_ref()
                .map(|channel| channel == &source.channel)
                .unwrap_or(true)
        })
        .filter(|source| {
            request
                .source_id
                .as_ref()
                .map(|source_id| source_id == &source.id)
                .unwrap_or(true)
        })
        .cloned()
        .collect()
}

fn sanitize_sources(sources: Vec<AiRadarSource>) -> Vec<AiRadarSource> {
    sources
        .into_iter()
        .enumerate()
        .filter_map(|(index, mut source)| {
            source.id = sanitize_text(&source.id, 80);
            source.name = sanitize_text(&source.name, 120);
            source.url = source
                .url
                .map(|url| url.trim().to_string())
                .filter(|url| !url.is_empty());
            source.query = source
                .query
                .map(|query| sanitize_text(&query, 240))
                .filter(|query| !query.is_empty());
            if source.id.is_empty() {
                source.id = format!("source-{index}");
            }
            if source.name.is_empty() {
                source.name = source.id.clone();
            }
            let has_supported_target = match &source.kind {
                AiRadarSourceKind::GithubSearch => source.query.is_some(),
                AiRadarSourceKind::ModelRanking => source
                    .url
                    .as_deref()
                    .map(is_openrouter_rankings_url)
                    .unwrap_or(false),
                AiRadarSourceKind::WechatOfficialAccount | AiRadarSourceKind::ToutiaoUser => {
                    rsshub_source_has_target(&source)
                }
                _ => source
                    .url
                    .as_deref()
                    .map(is_public_http_url)
                    .unwrap_or(false),
            };
            if has_supported_target {
                Some(source)
            } else {
                None
            }
        })
        .collect()
}

fn sanitize_settings(mut settings: AiRadarSettings) -> AiRadarSettings {
    settings = normalize_runtime_settings(settings);
    settings.refresh_interval_minutes = settings.refresh_interval_minutes.clamp(5, 24 * 60);
    settings.max_items = settings.max_items.clamp(20, 5000);
    settings.retention_days = settings.retention_days.clamp(1, 365);
    settings.sources = sanitize_sources(settings.sources);
    settings
}

fn normalize_runtime_settings(mut settings: AiRadarSettings) -> AiRadarSettings {
    let defaults = AppSettings::default().ai_radar;
    if settings.default_source_version < defaults.default_source_version {
        settings.sources.retain(|source| {
            source.created_at_ms.is_some() || !is_obsolete_default_source_id(&source.id)
        });
        let default_sources = defaults.sources;
        {
            let default_by_id = default_sources
                .iter()
                .map(|source| (source.id.as_str(), source))
                .collect::<HashMap<_, _>>();
            for source in &mut settings.sources {
                if source.created_at_ms.is_none() {
                    if let Some(default_source) = default_by_id.get(source.id.as_str()) {
                        *source = (*default_source).clone();
                    }
                }
            }
        }
        let existing_ids = settings
            .sources
            .iter()
            .map(|source| source.id.as_str())
            .collect::<HashSet<_>>();
        let missing_defaults = default_sources
            .into_iter()
            .filter(|source| !existing_ids.contains(source.id.as_str()))
            .collect::<Vec<_>>();
        settings.sources.extend(missing_defaults);
        settings.default_source_version = defaults.default_source_version;
    }
    settings
}

fn is_obsolete_default_source_id(source_id: &str) -> bool {
    matches!(source_id, "media-the-decoder")
}

async fn fetch_source(
    client: &Client,
    source: &AiRadarSource,
    previous_by_id: &HashMap<String, AiRadarItem>,
    translate_to_chinese: bool,
    now: i64,
) -> Result<Vec<AiRadarItem>, String> {
    match &source.kind {
        AiRadarSourceKind::GithubSearch => {
            let mut items = fetch_github_search(client, source, previous_by_id, now).await?;
            if translate_to_chinese {
                let _ = translate_items_to_chinese(client, &mut items, previous_by_id).await;
            }
            Ok(items)
        }
        AiRadarSourceKind::ModelRanking => fetch_model_ranking(client, source, now).await,
        AiRadarSourceKind::Rss
        | AiRadarSourceKind::Atom
        | AiRadarSourceKind::WechatOfficialAccount
        | AiRadarSourceKind::ToutiaoUser
        | AiRadarSourceKind::JsonFeed
        | AiRadarSourceKind::Article => {
            let mut items = match &source.kind {
                AiRadarSourceKind::Rss
                | AiRadarSourceKind::Atom
                | AiRadarSourceKind::WechatOfficialAccount
                | AiRadarSourceKind::ToutiaoUser => fetch_feed(client, source, now).await?,
                AiRadarSourceKind::JsonFeed => fetch_json_feed(client, source, now).await?,
                AiRadarSourceKind::Article => fetch_article(client, source, now).await?,
                AiRadarSourceKind::GithubSearch | AiRadarSourceKind::ModelRanking => {
                    unreachable!()
                }
            };
            if translate_to_chinese {
                let _ = translate_items_to_chinese(client, &mut items, previous_by_id).await;
            }
            Ok(items)
        }
    }
}

async fn fetch_feed(
    client: &Client,
    source: &AiRadarSource,
    now: i64,
) -> Result<Vec<AiRadarItem>, String> {
    let url = source_feed_url(source)?;
    let bytes = fetch_bytes(
        client,
        &url,
        "application/rss+xml, application/atom+xml, text/xml",
    )
    .await?;
    let feed = feed_rs::parser::parse(Cursor::new(bytes)).map_err(|err| err.to_string())?;
    let source_name = feed
        .title
        .map(|title| sanitize_text(&title.content, 120))
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| source.name.clone());
    let items = feed
        .entries
        .into_iter()
        .take(80)
        .filter_map(|entry| {
            let url = entry.links.first().map(|link| link.href.clone())?;
            if !is_public_http_url(&url) {
                return None;
            }
            let title = entry
                .title
                .map(|title| sanitize_text(&title.content, 240))
                .filter(|title| !title.is_empty())?;
            let summary = entry
                .summary
                .map(|summary| sanitize_text(&summary.content, 360))
                .filter(|summary| !summary.is_empty());
            let published_at_ms = entry
                .published
                .or(entry.updated)
                .map(|date| date.timestamp_millis());
            Some(media_item(
                source,
                &source_name,
                title,
                summary,
                url,
                published_at_ms,
                now,
            ))
        })
        .collect();
    Ok(items)
}

fn source_feed_url(source: &AiRadarSource) -> Result<String, String> {
    match &source.kind {
        AiRadarSourceKind::WechatOfficialAccount => rsshub_route_url(
            source,
            "wechat/ershicimi",
            "Missing WeChat RSSHub route or account id",
        ),
        AiRadarSourceKind::ToutiaoUser => rsshub_route_url(
            source,
            "toutiao/user/token",
            "Missing Toutiao RSSHub route or user token",
        ),
        _ => source_url(source).map(|url| url.to_string()),
    }
}

fn rsshub_source_has_target(source: &AiRadarSource) -> bool {
    source
        .url
        .as_deref()
        .filter(|url| !url.trim().is_empty())
        .map(is_public_http_url)
        .unwrap_or_else(|| {
            source
                .query
                .as_deref()
                .map(|query| !query.trim().is_empty())
                .unwrap_or(false)
        })
}

fn rsshub_route_url(
    source: &AiRadarSource,
    short_route_prefix: &str,
    missing_message: &str,
) -> Result<String, String> {
    if let Some(url) = source
        .url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
    {
        if is_public_http_url(url) {
            return Ok(url.to_string());
        }
        return Err("Source URL must be a public http(s) URL".to_string());
    }

    let value = source
        .query
        .as_deref()
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .ok_or_else(|| missing_message.to_string())?;
    if is_public_http_url(value) {
        return Ok(value.to_string());
    }
    if value.starts_with("http://") || value.starts_with("https://") {
        return Err("RSSHub URL must be a public http(s) URL".to_string());
    }

    let route = value.trim_start_matches('/');
    let route = if route.contains('/') {
        route.to_string()
    } else {
        format!("{short_route_prefix}/{}", encode_path_segment(route))
    };
    Ok(format!("{DEFAULT_RSSHUB_BASE_URL}/{route}"))
}

async fn fetch_json_feed(
    client: &Client,
    source: &AiRadarSource,
    now: i64,
) -> Result<Vec<AiRadarItem>, String> {
    let url = source_url(source)?;
    let bytes = fetch_bytes(client, url, "application/feed+json, application/json").await?;
    let feed: JsonFeed = serde_json::from_slice(&bytes).map_err(|err| err.to_string())?;
    let source_name = feed
        .title
        .map(|title| sanitize_text(&title, 120))
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| source.name.clone());
    let items = feed
        .items
        .into_iter()
        .take(80)
        .filter_map(|entry| {
            let url = entry
                .url
                .or(entry.external_url)
                .or(entry.id)
                .filter(|url| is_public_http_url(url))?;
            let title = entry
                .title
                .map(|title| sanitize_text(&title, 240))
                .filter(|title| !title.is_empty())?;
            let summary = entry
                .summary
                .or(entry.content_text)
                .map(|summary| sanitize_text(&summary, 360))
                .filter(|summary| !summary.is_empty());
            let published_at_ms = entry
                .date_published
                .or(entry.date_modified)
                .and_then(|value| parse_datetime_ms(&value));
            Some(media_item(
                source,
                &source_name,
                title,
                summary,
                url,
                published_at_ms,
                now,
            ))
        })
        .collect();
    Ok(items)
}

async fn fetch_article(
    client: &Client,
    source: &AiRadarSource,
    now: i64,
) -> Result<Vec<AiRadarItem>, String> {
    let url = source_url(source)?;
    let bytes = fetch_bytes(client, url, "text/html, application/xhtml+xml").await?;
    let html = String::from_utf8_lossy(&bytes);
    let title = extract_html_title(&html).unwrap_or_else(|| source.name.clone());
    let summary = extract_meta_content(&html, "description")
        .or_else(|| extract_meta_property(&html, "og:description"));
    let published_at_ms = extract_meta_property(&html, "article:published_time")
        .and_then(|value| parse_datetime_ms(&value));
    Ok(vec![media_item(
        source,
        &source.name,
        title,
        summary,
        url.to_string(),
        published_at_ms,
        now,
    )])
}

async fn fetch_github_search(
    client: &Client,
    source: &AiRadarSource,
    previous_by_id: &HashMap<String, AiRadarItem>,
    now: i64,
) -> Result<Vec<AiRadarItem>, String> {
    let query = source
        .query
        .as_deref()
        .ok_or_else(|| "Missing GitHub query".to_string())?;
    let url = format!(
        "https://api.github.com/search/repositories?q={}&sort=stars&order=desc&per_page=30",
        encode_query_component(query)
    );
    let bytes = fetch_bytes(
        client,
        &url,
        "application/vnd.github+json, application/json",
    )
    .await?;
    let response: GitHubSearchResponse =
        serde_json::from_slice(&bytes).map_err(|err| err.to_string())?;
    let items = response
        .items
        .into_iter()
        .take(30)
        .filter_map(|repo| {
            if repo.full_name.trim().is_empty() || !is_public_http_url(&repo.html_url) {
                return None;
            }
            let id = stable_item_id(&AiRadarChannel::Github, &repo.html_url);
            let previous_stars = previous_by_id
                .get(&id)
                .and_then(|item| item.metrics.stars)
                .unwrap_or(repo.stargazers_count);
            let star_delta = repo.stargazers_count.saturating_sub(previous_stars);
            let updated_at_ms = repo
                .updated_at
                .as_deref()
                .and_then(|value| parse_datetime_ms(value));
            let mut tags = repo.topics.into_iter().take(8).collect::<Vec<_>>();
            if let Some(language) = repo.language {
                if !language.trim().is_empty() {
                    tags.insert(0, language);
                }
            }
            Some(AiRadarItem {
                id,
                channel: AiRadarChannel::Github,
                source_id: source.id.clone(),
                source_name: source.name.clone(),
                title: repo.full_name,
                summary: repo
                    .description
                    .map(|value| sanitize_text(&value, 360))
                    .filter(|value| !value.is_empty()),
                title_zh: None,
                summary_zh: None,
                url: repo.html_url,
                published_at_ms: updated_at_ms,
                fetched_at_ms: now,
                score: github_score(repo.stargazers_count, repo.forks_count, star_delta),
                tags,
                metrics: AiRadarItemMetrics {
                    stars: Some(repo.stargazers_count),
                    forks: Some(repo.forks_count),
                    open_issues: Some(repo.open_issues_count),
                    star_delta_24h: Some(star_delta),
                    ..AiRadarItemMetrics::default()
                },
            })
        })
        .collect();
    Ok(items)
}

async fn fetch_model_ranking(
    client: &Client,
    source: &AiRadarSource,
    now: i64,
) -> Result<Vec<AiRadarItem>, String> {
    let url = source_url(source)?;
    let parsed = Url::parse(url).map_err(|err| err.to_string())?;
    if !is_openrouter_rankings_url(url) {
        return Err("Only OpenRouter rankings URLs are supported for model rankings".to_string());
    }

    let html_bytes = fetch_bytes(client, url, "text/html, application/xhtml+xml").await?;
    let html = String::from_utf8_lossy(&html_bytes);
    let action_id = discover_openrouter_model_rankings_action_id(client, &parsed, &html).await?;
    let ranking_type = openrouter_ranking_type(&parsed);
    let response_bytes =
        post_openrouter_model_rankings_action(client, &parsed, &action_id, &ranking_type).await?;
    let response_text = String::from_utf8_lossy(&response_bytes);
    let rows = extract_openrouter_ranking_rows(&response_text)?;

    Ok(rows
        .into_iter()
        .take(30)
        .enumerate()
        .filter_map(|(index, row)| {
            openrouter_ranking_item(source, row, index + 1, &ranking_type, now)
        })
        .collect())
}

async fn discover_openrouter_model_rankings_action_id(
    client: &Client,
    page_url: &Url,
    html: &str,
) -> Result<String, String> {
    if let Some(action_id) = extract_openrouter_model_rankings_action_id(html) {
        return Ok(action_id);
    }

    for chunk_path in extract_next_chunk_paths(html).into_iter().take(80) {
        let chunk_url = page_url.join(&chunk_path).map_err(|err| err.to_string())?;
        let bytes = fetch_bytes(
            client,
            chunk_url.as_str(),
            "application/javascript, text/javascript",
        )
        .await?;
        let chunk = String::from_utf8_lossy(&bytes);
        if let Some(action_id) = extract_openrouter_model_rankings_action_id(&chunk) {
            return Ok(action_id);
        }
    }

    Err("OpenRouter rankings action was not found".to_string())
}

async fn post_openrouter_model_rankings_action(
    _client: &Client,
    url: &Url,
    action_id: &str,
    ranking_type: &str,
) -> Result<Vec<u8>, String> {
    let validated = parse_public_http_url(url.as_str()).await?;
    let request_client = build_client_for_url(&validated.url, &validated.addrs)?;
    let body = format!("[\"{}\"]", json_escape_string(ranking_type));
    let mut response = request_client
        .post(validated.url.clone())
        .header(ACCEPT, "text/x-component")
        .header(CONTENT_TYPE, "text/plain;charset=UTF-8")
        .header("Next-Action", action_id)
        .header("RSC", "1")
        .header("Next-Url", next_url_header(&validated.url))
        .body(body)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if response.status().is_redirection() {
        return Err("OpenRouter rankings action redirected unexpectedly".to_string());
    }
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    if response.content_length().unwrap_or(0) > MAX_FETCH_BYTES {
        return Err("Response is too large".to_string());
    }
    read_limited_response_body(&mut response).await
}

fn extract_openrouter_ranking_rows(payload: &str) -> Result<Vec<OpenRouterRankingRow>, String> {
    for line in payload.lines() {
        let Some((_, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        if !value.starts_with('[') {
            continue;
        }
        let Ok(rows) = serde_json::from_str::<Vec<OpenRouterRankingRow>>(value) else {
            continue;
        };
        if rows
            .iter()
            .any(|row| !row.model_permaslug.trim().is_empty() || !row.variant_slug().is_empty())
        {
            return Ok(rows);
        }
    }
    Err("OpenRouter rankings response did not include model rows".to_string())
}

fn extract_openrouter_model_rankings_action_id(content: &str) -> Option<String> {
    let action_name_index = content.find(OPENROUTER_MODEL_RANKINGS_ACTION_NAME)?;
    let before_action = &content[..action_name_index];
    let marker = "createServerReference)(\"";
    let marker_index = before_action.rfind(marker)?;
    let id_start = marker_index + marker.len();
    let id_end = before_action[id_start..].find('"')? + id_start;
    let action_id = &before_action[id_start..id_end];
    if action_id.len() >= 16 && action_id.chars().all(|ch| ch.is_ascii_hexdigit()) {
        Some(action_id.to_string())
    } else {
        None
    }
}

fn extract_next_chunk_paths(html: &str) -> Vec<String> {
    let mut paths = Vec::new();
    let mut seen = HashSet::new();
    let mut rest = html;
    while let Some(index) = rest.find("/_next/static/chunks/") {
        let candidate = &rest[index..];
        let end = candidate
            .find(|ch: char| ch == '"' || ch == '\'' || ch == '<' || ch.is_whitespace())
            .unwrap_or(candidate.len());
        let path = candidate[..end].trim_end_matches('\\').to_string();
        if path.ends_with(".js") && seen.insert(path.clone()) {
            paths.push(path);
        }
        rest = &candidate[end.min(candidate.len())..];
    }
    paths
}

fn openrouter_ranking_item(
    source: &AiRadarSource,
    row: OpenRouterRankingRow,
    rank: usize,
    ranking_type: &str,
    now: i64,
) -> Option<AiRadarItem> {
    let model_slug = row.model_permaslug.trim().to_string();
    if model_slug.is_empty() {
        return None;
    }
    let variant_slug = row.variant_slug();
    let total_tokens = row.total_tokens();
    let url_slug = if variant_slug.is_empty() {
        model_slug.clone()
    } else {
        variant_slug.clone()
    };
    let url = format!("https://openrouter.ai/{url_slug}");
    let provider = model_slug
        .split('/')
        .next()
        .unwrap_or("openrouter")
        .to_string();
    let variant_label = row
        .variant
        .as_deref()
        .and_then(openrouter_variant_label)
        .map(str::to_string);
    let title = match variant_label {
        Some(ref variant) => format!("#{rank} {model_slug} ({variant})"),
        None => format!("#{rank} {model_slug}"),
    };
    let summary = format!(
        "OpenRouter {}模型调用榜第 {} 名：{} tokens，{} requests。Prompt {} / Completion {}。",
        openrouter_ranking_type_label(ranking_type),
        rank,
        human_count(total_tokens),
        human_count(row.count),
        human_count(row.total_prompt_tokens),
        human_count(row.total_completion_tokens)
    );
    let mut tags = vec![
        "OpenRouter".to_string(),
        openrouter_ranking_type_tag(ranking_type).to_string(),
        provider,
    ];
    if let Some(variant) = variant_label {
        tags.push(variant);
    }
    let id_key = format!("{}:{ranking_type}:{url}", source.id);
    Some(AiRadarItem {
        id: stable_item_id(&AiRadarChannel::Models, &id_key),
        channel: AiRadarChannel::Models,
        source_id: source.id.clone(),
        source_name: source.name.clone(),
        title,
        summary: Some(summary),
        title_zh: None,
        summary_zh: None,
        url,
        published_at_ms: row.date.as_deref().and_then(parse_openrouter_datetime_ms),
        fetched_at_ms: now,
        score: total_tokens.max(0) as f64,
        tags,
        metrics: AiRadarItemMetrics {
            tokens: Some(total_tokens),
            requests: Some(row.count),
            rank: Some(rank as i64),
            change: row.change,
            ..AiRadarItemMetrics::default()
        },
    })
}

async fn translate_items_to_chinese(
    client: &Client,
    items: &mut [AiRadarItem],
    previous_by_id: &HashMap<String, AiRadarItem>,
) -> bool {
    let mut changed = false;
    let mut jobs = Vec::new();
    let candidate_indexes =
        items
            .iter()
            .enumerate()
            .filter_map(|(index, item)| (item.channel == AiRadarChannel::Media).then_some(index))
            .chain(items.iter().enumerate().filter_map(|(index, item)| {
                (item.channel == AiRadarChannel::Github).then_some(index)
            }))
            .collect::<Vec<_>>();
    for index in candidate_indexes {
        let item = &mut items[index];
        let before_title = item.title_zh.clone();
        let before_summary = item.summary_zh.clone();
        if apply_cached_translation(item, previous_by_id) {
            changed = changed || item.title_zh != before_title || item.summary_zh != before_summary;
            continue;
        }
        if !item_needs_chinese_translation(item) {
            continue;
        }
        if jobs.len() >= MAX_TRANSLATED_ITEMS_PER_SOURCE {
            break;
        }
        let Some(input) = translation_input_for_item(item) else {
            continue;
        };
        jobs.push((index, input));
    }

    let translations = stream::iter(jobs)
        .map(|(index, input)| {
            let client = client.clone();
            async move { (index, translate_text_to_chinese(&client, &input).await.ok()) }
        })
        .buffer_unordered(MAX_TRANSLATION_CONCURRENCY)
        .collect::<Vec<_>>()
        .await;
    for (index, translated) in translations {
        let Some(translated) = translated else {
            continue;
        };
        let Some(item) = items.get_mut(index) else {
            continue;
        };
        let before_title = item.title_zh.clone();
        let before_summary = item.summary_zh.clone();
        apply_translated_item_text(item, &translated);
        changed = changed || item.title_zh != before_title || item.summary_zh != before_summary;
    }
    changed
}

fn items_need_chinese_translation(items: &[AiRadarItem]) -> bool {
    items.iter().any(item_needs_chinese_translation)
}

fn schedule_translation_backfill(cache_file: PathBuf) {
    if !begin_translation_backfill(&cache_file) {
        return;
    }
    let path_for_finish = cache_file.clone();
    tokio::spawn(async move {
        if let Ok(client) = build_client() {
            let cache_lock = cache_write_lock(&cache_file);
            let _cache_guard = cache_lock.lock().await;
            let mut translated_cache = read_cache(&cache_file).await;
            if translate_items_to_chinese(&client, &mut translated_cache.items, &HashMap::new())
                .await
            {
                let mut latest_cache = read_cache(&cache_file).await;
                if merge_translations_into_cache(&mut latest_cache, &translated_cache.items) {
                    let _ = write_cache(&cache_file, &latest_cache).await;
                }
            }
        }
        finish_translation_backfill(&path_for_finish);
    });
}

fn merge_translations_into_cache(
    cache: &mut AiRadarCache,
    translated_items: &[AiRadarItem],
) -> bool {
    let translated_by_id = translated_items
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect::<HashMap<_, _>>();
    let mut changed = false;
    for item in &mut cache.items {
        let Some(translated) = translated_by_id.get(item.id.as_str()) else {
            continue;
        };
        if translated.title != item.title || translated.summary != item.summary {
            continue;
        }
        let before_title = item.title_zh.clone();
        let before_summary = item.summary_zh.clone();
        if !is_missing_translation(&translated.title_zh) {
            item.title_zh = translated.title_zh.clone();
        }
        if !is_missing_translation(&translated.summary_zh) {
            item.summary_zh = translated.summary_zh.clone();
        }
        changed = changed || item.title_zh != before_title || item.summary_zh != before_summary;
    }
    changed
}

fn translation_backfill_paths() -> &'static StdMutex<HashSet<PathBuf>> {
    TRANSLATION_BACKFILL_PATHS.get_or_init(|| StdMutex::new(HashSet::new()))
}

fn begin_translation_backfill(path: &Path) -> bool {
    let mut paths = translation_backfill_paths()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    paths.insert(path.to_path_buf())
}

fn finish_translation_backfill(path: &Path) {
    let mut paths = translation_backfill_paths()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    paths.remove(path);
}

fn apply_cached_translation(
    item: &mut AiRadarItem,
    previous_by_id: &HashMap<String, AiRadarItem>,
) -> bool {
    let Some(previous) = previous_by_id.get(&item.id) else {
        return false;
    };
    if previous.title != item.title || previous.summary != item.summary {
        return false;
    }
    item.title_zh = previous.title_zh.clone();
    item.summary_zh = previous.summary_zh.clone();
    (item.title_zh.is_some() || item.summary_zh.is_some()) && !item_needs_chinese_translation(item)
}

fn item_needs_chinese_translation(item: &AiRadarItem) -> bool {
    if item.channel == AiRadarChannel::Models {
        return false;
    }
    if item.channel == AiRadarChannel::Github {
        return item
            .summary
            .as_deref()
            .map(|summary| !contains_cjk(summary) && is_missing_translation(&item.summary_zh))
            .unwrap_or(false);
    }
    let title_needs_translation =
        !contains_cjk(&item.title) && is_missing_translation(&item.title_zh);
    let summary_needs_translation = item
        .summary
        .as_deref()
        .map(|summary| !contains_cjk(summary) && is_missing_translation(&item.summary_zh))
        .unwrap_or(false);
    title_needs_translation || summary_needs_translation
}

fn is_missing_translation(value: &Option<String>) -> bool {
    value.as_deref().map(str::trim).unwrap_or("").is_empty()
}

fn translation_input_for_item(item: &AiRadarItem) -> Option<String> {
    if item.channel == AiRadarChannel::Github {
        return item
            .summary
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| truncate_chars(value, MAX_TRANSLATION_INPUT_CHARS));
    }
    let title = item.title.trim();
    if title.is_empty() {
        return None;
    }
    let mut value = title.to_string();
    if let Some(summary) = item
        .summary
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        value.push('\n');
        value.push_str(summary);
    }
    Some(truncate_chars(&value, MAX_TRANSLATION_INPUT_CHARS))
}

async fn translate_text_to_chinese(client: &Client, value: &str) -> Result<String, String> {
    let input = value.trim();
    if input.is_empty() {
        return Err("Translation text is empty".to_string());
    }
    let url = format!(
        "{}{}",
        GOOGLE_TRANSLATE_ENDPOINT,
        encode_query_component(input)
    );
    let bytes = fetch_bytes(client, &url, "application/json").await?;
    let payload: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|err| err.to_string())?;
    extract_google_translation(&payload).ok_or_else(|| "Translation response was empty".to_string())
}

fn extract_google_translation(payload: &serde_json::Value) -> Option<String> {
    let segments = payload.get(0)?.as_array()?;
    let mut output = String::new();
    for segment in segments {
        if let Some(text) = segment.get(0).and_then(|value| value.as_str()) {
            output.push_str(text);
        }
    }
    let output = output.trim();
    if output.is_empty() {
        None
    } else {
        Some(output.to_string())
    }
}

fn apply_translated_item_text(item: &mut AiRadarItem, translated: &str) {
    if item.channel == AiRadarChannel::Github {
        let summary = sanitize_text(translated, 220);
        if !summary.is_empty() && item.summary.as_deref() != Some(summary.as_str()) {
            item.summary_zh = Some(summary);
        }
        return;
    }
    let mut lines = translated
        .lines()
        .map(|line| sanitize_text(line, 240))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    if lines.is_empty() {
        let fallback = sanitize_text(translated, 240);
        if !fallback.is_empty() {
            item.title_zh = Some(fallback);
        }
        return;
    }
    let title = sanitize_text(&lines.remove(0), 180);
    if !title.is_empty() && title != item.title {
        item.title_zh = Some(title);
    }
    if item.summary.is_some() {
        let summary = sanitize_text(&lines.join(" "), 220);
        if !summary.is_empty() && item.summary.as_deref() != Some(summary.as_str()) {
            item.summary_zh = Some(summary);
        }
    }
}

fn contains_cjk(value: &str) -> bool {
    value.chars().any(|ch| {
        matches!(
            ch,
            '\u{3400}'..='\u{4DBF}'
                | '\u{4E00}'..='\u{9FFF}'
                | '\u{F900}'..='\u{FAFF}'
        )
    })
}

async fn fetch_bytes(_client: &Client, url: &str, accept: &str) -> Result<Vec<u8>, String> {
    let mut current = parse_public_http_url(url).await?;
    for redirect_count in 0..=MAX_REDIRECTS {
        let request_client = build_client_for_url(&current.url, &current.addrs)?;
        let mut response = request_client
            .get(current.url.clone())
            .header(ACCEPT, accept)
            .send()
            .await
            .map_err(|err| err.to_string())?;

        if response.status().is_redirection() {
            if redirect_count == MAX_REDIRECTS {
                return Err("Too many redirects".to_string());
            }
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "Redirect is missing a Location header".to_string())?;
            current = parse_public_http_url(
                current
                    .url
                    .join(location)
                    .map_err(|err| err.to_string())?
                    .as_str(),
            )
            .await?;
            continue;
        }

        if !response.status().is_success() {
            return Err(format!("HTTP {}", response.status()));
        }
        if response.content_length().unwrap_or(0) > MAX_FETCH_BYTES {
            return Err("Response is too large".to_string());
        }
        return read_limited_response_body(&mut response).await;
    }
    Err("Too many redirects".to_string())
}

fn client_builder() -> ClientBuilder {
    Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent(USER_AGENT_VALUE)
        .redirect(Policy::none())
}

fn build_client() -> Result<Client, String> {
    client_builder().build().map_err(|err| err.to_string())
}

fn build_client_for_url(url: &Url, addrs: &[SocketAddr]) -> Result<Client, String> {
    let mut builder = client_builder();
    if !addrs.is_empty() {
        let host = url
            .host_str()
            .ok_or_else(|| "Source URL must include a host".to_string())?;
        builder = builder.resolve_to_addrs(host, addrs);
    }
    builder.build().map_err(|err| err.to_string())
}

fn source_url(source: &AiRadarSource) -> Result<&str, String> {
    source
        .url
        .as_deref()
        .filter(|url| is_public_http_url(url))
        .ok_or_else(|| "Missing or unsupported public URL".to_string())
}

fn is_openrouter_rankings_url(url: &str) -> bool {
    let Ok(parsed) = parse_public_http_url_syntax(url) else {
        return false;
    };
    let host = parsed
        .host_str()
        .unwrap_or("")
        .trim_end_matches('.')
        .to_ascii_lowercase();
    (host == "openrouter.ai" || host == "www.openrouter.ai")
        && parsed.path().trim_end_matches('/') == "/rankings"
}

fn next_url_header(url: &Url) -> String {
    let mut value = url.path().to_string();
    if let Some(query) = url.query() {
        value.push('?');
        value.push_str(query);
    }
    value
}

fn openrouter_ranking_type(url: &Url) -> String {
    url.query_pairs()
        .find_map(|(key, value)| {
            (key == "view").then(|| match value.as_ref() {
                "day" | "week" | "month" => value.to_string(),
                _ => "week".to_string(),
            })
        })
        .unwrap_or_else(|| "week".to_string())
}

fn openrouter_ranking_type_label(value: &str) -> &'static str {
    match value {
        "day" => "今日",
        "month" => "本月",
        _ => "本周",
    }
}

fn openrouter_ranking_type_tag(value: &str) -> &'static str {
    match value {
        "day" => "day",
        "month" => "month",
        _ => "week",
    }
}

fn openrouter_variant_label(value: &str) -> Option<&str> {
    match value {
        "free" => Some("free"),
        "standard" | "" => None,
        _ => Some(value),
    }
}

fn json_escape_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

async fn read_limited_response_body(response: &mut reqwest::Response) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|err| err.to_string())? {
        if output.len().saturating_add(chunk.len()) > MAX_FETCH_BYTES as usize {
            return Err("Response is too large".to_string());
        }
        output.extend_from_slice(&chunk);
    }
    Ok(output)
}

async fn parse_public_http_url(url: &str) -> Result<ValidatedPublicUrl, String> {
    let parsed = parse_public_http_url_syntax(url)?;
    let addrs = validate_public_host(&parsed).await?;
    Ok(ValidatedPublicUrl { url: parsed, addrs })
}

fn parse_public_http_url_syntax(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url.trim()).map_err(|err| err.to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Only public http/https sources are supported".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Credentials in source URLs are not supported".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Source URL must include a host".to_string())?;
    if is_blocked_host_name(host) {
        return Err("Private or local hosts are not supported".to_string());
    }
    if let Ok(ip) = normalize_url_host_for_ip_parse(host).parse::<IpAddr>() {
        reject_private_ip(ip)?;
    }
    Ok(parsed)
}

async fn validate_public_host(url: &Url) -> Result<Vec<SocketAddr>, String> {
    let host = url
        .host_str()
        .ok_or_else(|| "Source URL must include a host".to_string())?;
    if normalize_url_host_for_ip_parse(host)
        .parse::<IpAddr>()
        .is_ok()
    {
        return Ok(Vec::new());
    }
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "Source URL must include a valid port".to_string())?;
    let addrs = tokio::net::lookup_host((host, port))
        .await
        .map_err(|err| err.to_string())?
        .collect::<Vec<_>>();
    if addrs.is_empty() {
        return Err("Source host did not resolve".to_string());
    }
    for addr in &addrs {
        reject_private_ip(addr.ip())?;
    }
    Ok(addrs)
}

fn is_blocked_host_name(host: &str) -> bool {
    let normalized = normalize_url_host_for_ip_parse(host)
        .trim_end_matches('.')
        .to_ascii_lowercase();
    normalized == "localhost" || normalized.ends_with(".localhost")
}

fn normalize_url_host_for_ip_parse(host: &str) -> &str {
    host.trim().trim_start_matches('[').trim_end_matches(']')
}

fn reject_private_ip(ip: IpAddr) -> Result<(), String> {
    if is_blocked_ip(ip) {
        Err("Private or local hosts are not supported".to_string())
    } else {
        Ok(())
    }
}

fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(value) => is_blocked_ipv4(value),
        IpAddr::V6(value) => is_blocked_ipv6(value),
    }
}

fn is_blocked_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, _, _] = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.is_documentation()
        || a == 0
        || a >= 224
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
}

fn is_blocked_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return is_blocked_ipv4(mapped);
    }
    let segments = ip.segments();
    let first = segments[0];
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (first & 0xfe00) == 0xfc00
        || (first & 0xffc0) == 0xfe80
}

fn media_item(
    source: &AiRadarSource,
    source_name: &str,
    title: String,
    summary: Option<String>,
    url: String,
    published_at_ms: Option<i64>,
    now: i64,
) -> AiRadarItem {
    AiRadarItem {
        id: stable_item_id(&AiRadarChannel::Media, &url),
        channel: AiRadarChannel::Media,
        source_id: source.id.clone(),
        source_name: source_name.to_string(),
        title,
        summary,
        title_zh: None,
        summary_zh: None,
        url,
        published_at_ms,
        fetched_at_ms: now,
        score: media_score(published_at_ms, now),
        tags: Vec::new(),
        metrics: AiRadarItemMetrics::default(),
    }
}

fn trim_items(
    settings: &AiRadarSettings,
    mut items: Vec<AiRadarItem>,
    now: i64,
) -> Vec<AiRadarItem> {
    let retention_ms = (settings.retention_days.max(1) as i64) * 24 * 60 * 60 * 1000;
    let cutoff = now.saturating_sub(retention_ms);
    items.retain(|item| item.published_at_ms.unwrap_or(item.fetched_at_ms) >= cutoff);
    items.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                right
                    .published_at_ms
                    .unwrap_or(right.fetched_at_ms)
                    .cmp(&left.published_at_ms.unwrap_or(left.fetched_at_ms))
            })
    });
    items.truncate(settings.max_items.max(1));
    items
}

fn media_score(published_at_ms: Option<i64>, now: i64) -> f64 {
    let age_hours = published_at_ms
        .map(|published| now.saturating_sub(published) as f64 / 3_600_000.0)
        .unwrap_or(72.0);
    (10_000.0 / (1.0 + age_hours)).max(1.0)
}

fn github_score(stars: i64, forks: i64, star_delta: i64) -> f64 {
    stars as f64 + forks as f64 * 2.0 + star_delta.max(0) as f64 * 50.0
}

fn stable_item_id(channel: &AiRadarChannel, url: &str) -> String {
    let channel_prefix = match channel {
        AiRadarChannel::Media => "media",
        AiRadarChannel::Github => "github",
        AiRadarChannel::Models => "models",
    };
    format!("{channel_prefix}:{}", fnv1a64(url.trim()))
}

fn fnv1a64(value: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn parse_datetime_ms(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.timestamp_millis())
}

fn parse_openrouter_datetime_ms(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.timestamp_millis())
        .ok()
        .or_else(|| {
            NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|date| {
                    DateTime::<Utc>::from_naive_utc_and_offset(date, Utc).timestamp_millis()
                })
        })
}

fn human_count(value: i64) -> String {
    let value = value.max(0) as f64;
    if value >= 1_000_000_000_000.0 {
        format!("{:.2}T", value / 1_000_000_000_000.0)
    } else if value >= 1_000_000_000.0 {
        format!("{:.2}B", value / 1_000_000_000.0)
    } else if value >= 1_000_000.0 {
        format!("{:.2}M", value / 1_000_000.0)
    } else if value >= 1_000.0 {
        format!("{:.2}K", value / 1_000.0)
    } else {
        (value as i64).to_string()
    }
}

fn sanitize_text(value: &str, max_chars: usize) -> String {
    let mut output = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if output.chars().count() > max_chars {
        output = output.chars().take(max_chars).collect();
        output.push_str("...");
    }
    output
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let mut output = value.chars().take(max_chars).collect::<String>();
    output.push_str("...");
    output
}

fn is_public_http_url(url: &str) -> bool {
    parse_public_http_url_syntax(url).is_ok()
}

fn encode_query_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char)
            }
            b' ' => encoded.push('+'),
            other => encoded.push_str(&format!("%{other:02X}")),
        }
    }
    encoded
}

fn encode_path_segment(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char)
            }
            other => encoded.push_str(&format!("%{other:02X}")),
        }
    }
    encoded
}

fn extract_html_title(html: &str) -> Option<String> {
    extract_between_case_insensitive(html, "<title", "</title>").and_then(|value| {
        value
            .split_once('>')
            .map(|(_, title)| sanitize_text(&decode_minimal_html(title), 240))
            .filter(|title| !title.is_empty())
    })
}

fn extract_meta_content(html: &str, name: &str) -> Option<String> {
    extract_meta_attr(html, "name", name)
}

fn extract_meta_property(html: &str, property: &str) -> Option<String> {
    extract_meta_attr(html, "property", property)
}

fn extract_meta_attr(html: &str, attr: &str, value: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut offset = 0usize;
    while let Some(relative_start) = lower[offset..].find("<meta") {
        let start = offset + relative_start;
        let Some(relative_end) = lower[start..].find('>') else {
            return None;
        };
        let end = start + relative_end + 1;
        let tag = &html[start..end];
        let lower_tag = tag.to_ascii_lowercase();
        if lower_tag.contains(&format!("{attr}=\"{}\"", value.to_ascii_lowercase()))
            || lower_tag.contains(&format!("{attr}='{}'", value.to_ascii_lowercase()))
        {
            return extract_attr_value(tag, "content")
                .map(|content| sanitize_text(&decode_minimal_html(&content), 360))
                .filter(|content| !content.is_empty());
        }
        offset = end;
    }
    None
}

fn extract_attr_value(tag: &str, attr: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let pattern = format!("{attr}=");
    let index = lower.find(&pattern)? + pattern.len();
    let rest = &tag[index..];
    let quote = rest.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let value = &rest[quote.len_utf8()..];
    let end = value.find(quote)?;
    Some(value[..end].to_string())
}

fn extract_between_case_insensitive(html: &str, start: &str, end: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start_index = lower.find(&start.to_ascii_lowercase())?;
    let content_start = start_index + start.len();
    let end_index = lower[content_start..].find(&end.to_ascii_lowercase())? + content_start;
    Some(html[start_index..end_index].to_string())
}

fn decode_minimal_html(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

#[cfg(test)]
mod tests {
    use tokio::sync::Mutex;

    use super::{
        AiRadarCache, OpenRouterRankingRow, ai_radar_refresh_core, apply_translated_item_text,
        build_response, cache_path, encode_path_segment, encode_query_component,
        extract_google_translation, extract_next_chunk_paths,
        extract_openrouter_model_rankings_action_id, extract_openrouter_ranking_rows,
        is_public_http_url, item_needs_chinese_translation, merge_translations_into_cache,
        normalize_runtime_settings, now_ms, openrouter_ranking_item, read_cache, sanitize_text,
        scheduler_status_for_cache, source_feed_url, write_cache,
    };
    use crate::types::{
        AiRadarChannel, AiRadarItem, AiRadarItemMetrics, AiRadarRefreshRequest, AiRadarSettings,
        AiRadarSource, AiRadarSourceKind, AiRadarSourceState, AppSettings,
    };

    #[test]
    fn encodes_github_queries() {
        assert_eq!(
            encode_query_component("topic:llm stars:>100"),
            "topic%3Allm+stars%3A%3E100"
        );
    }

    #[test]
    fn encodes_rsshub_path_segments() {
        assert_eq!(
            encode_path_segment("机器之心"),
            "%E6%9C%BA%E5%99%A8%E4%B9%8B%E5%BF%83"
        );
    }

    #[test]
    fn rejects_non_public_urls() {
        assert!(is_public_http_url("https://example.com/feed.xml"));
        assert!(!is_public_http_url("file:///tmp/feed.xml"));
        assert!(!is_public_http_url("https://user@example.com/feed.xml"));
        assert!(!is_public_http_url("http://127.0.0.1:8080/feed.xml"));
        assert!(!is_public_http_url(
            "http://169.254.169.254/latest/meta-data"
        ));
        assert!(!is_public_http_url("http://192.168.1.1/feed.xml"));
        assert!(!is_public_http_url("http://localhost/feed.xml"));
        assert!(!is_public_http_url("http://[::ffff:127.0.0.1]/feed.xml"));
    }

    #[test]
    fn normalizes_text_whitespace() {
        assert_eq!(sanitize_text(" A\n  B\tC ", 20), "A B C");
    }

    #[test]
    fn extracts_openrouter_rankings_action_id_from_chunks() {
        let chunk = r#"let s=(0,r.createServerReference)("40824635c5eb77626bdf6795ffbf382c0862b321e1",r.callServer,void 0,r.findSourceMapURL,"getModelRankingsCached");"#;

        assert_eq!(
            extract_openrouter_model_rankings_action_id(chunk).as_deref(),
            Some("40824635c5eb77626bdf6795ffbf382c0862b321e1")
        );
    }

    #[test]
    fn extracts_next_chunk_paths_without_duplicates() {
        let html = r#"<script src="/_next/static/chunks/a.js"></script><script src="/_next/static/chunks/a.js"></script><script src="/_next/static/chunks/b.js\"></script>"#;

        assert_eq!(
            extract_next_chunk_paths(html),
            vec![
                "/_next/static/chunks/a.js".to_string(),
                "/_next/static/chunks/b.js".to_string()
            ]
        );
    }

    #[test]
    fn converts_openrouter_rankings_to_model_items() {
        let source = AiRadarSource {
            id: "models-openrouter-weekly".to_string(),
            name: "OpenRouter Weekly Models".to_string(),
            kind: AiRadarSourceKind::ModelRanking,
            url: Some("https://openrouter.ai/rankings?view=week".to_string()),
            query: None,
            enabled: true,
            channel: AiRadarChannel::Models,
            created_at_ms: None,
        };
        let item = openrouter_ranking_item(
            &source,
            OpenRouterRankingRow {
                date: Some("2026-05-17 00:00:00".to_string()),
                model_permaslug: "deepseek/deepseek-v4-flash-20260423".to_string(),
                variant: Some("free".to_string()),
                variant_permaslug: Some("deepseek/deepseek-v4-flash-20260423:free".to_string()),
                total_prompt_tokens: 44_566_347_399,
                total_completion_tokens: 1_282_394_252,
                total_native_tokens_reasoning: 0,
                count: 1_838_333,
                change: Some(42.0),
            },
            1,
            "week",
            123,
        )
        .expect("item");

        assert_eq!(item.channel, AiRadarChannel::Models);
        assert_eq!(item.metrics.rank, Some(1));
        assert_eq!(item.metrics.tokens, Some(45_848_741_651));
        assert!(
            item.summary
                .as_deref()
                .unwrap_or("")
                .contains("本周模型调用榜第 1 名")
        );
        assert_eq!(
            item.url,
            "https://openrouter.ai/deepseek/deepseek-v4-flash-20260423:free"
        );
        assert!(!item_needs_chinese_translation(&item));
    }

    #[test]
    fn openrouter_model_item_ids_include_ranking_source_and_scope() {
        let weekly_source = AiRadarSource {
            id: "models-openrouter-weekly".to_string(),
            name: "OpenRouter Weekly Models".to_string(),
            kind: AiRadarSourceKind::ModelRanking,
            url: Some("https://openrouter.ai/rankings?view=week".to_string()),
            query: None,
            enabled: true,
            channel: AiRadarChannel::Models,
            created_at_ms: None,
        };
        let daily_source = AiRadarSource {
            id: "models-openrouter-daily".to_string(),
            name: "OpenRouter Daily Models".to_string(),
            kind: AiRadarSourceKind::ModelRanking,
            url: Some("https://openrouter.ai/rankings?view=day".to_string()),
            query: None,
            enabled: true,
            channel: AiRadarChannel::Models,
            created_at_ms: None,
        };
        let weekly = openrouter_ranking_item(
            &weekly_source,
            OpenRouterRankingRow {
                date: Some("2026-05-17 00:00:00".to_string()),
                model_permaslug: "qwen/qwen3".to_string(),
                variant: Some("free".to_string()),
                variant_permaslug: Some("qwen/qwen3:free".to_string()),
                total_prompt_tokens: 3,
                total_completion_tokens: 2,
                total_native_tokens_reasoning: 1,
                count: 4,
                change: Some(5.0),
            },
            1,
            "week",
            123,
        )
        .expect("weekly item");
        let daily = openrouter_ranking_item(
            &daily_source,
            OpenRouterRankingRow {
                date: Some("2026-05-17 00:00:00".to_string()),
                model_permaslug: "qwen/qwen3".to_string(),
                variant: Some("free".to_string()),
                variant_permaslug: Some("qwen/qwen3:free".to_string()),
                total_prompt_tokens: 3,
                total_completion_tokens: 2,
                total_native_tokens_reasoning: 1,
                count: 4,
                change: Some(5.0),
            },
            1,
            "day",
            123,
        )
        .expect("daily item");

        assert_ne!(weekly.id, daily.id);
        assert_eq!(weekly.url, daily.url);
    }

    #[test]
    fn extracts_openrouter_ranking_rows_from_rsc_payload() {
        let payload = r#"0:["$@1"]
1:{"a":"$@1"}
2:[{"date":"2026-05-17 00:00:00","model_permaslug":"qwen/qwen3","variant":"free","total_completion_tokens":2,"total_prompt_tokens":3,"total_native_tokens_reasoning":1,"count":4,"variant_permaslug":"qwen/qwen3:free","change":5}]
"#;

        let rows = extract_openrouter_ranking_rows(payload).expect("rows");

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].total_tokens(), 6);
        assert_eq!(rows[0].variant_slug(), "qwen/qwen3:free");
    }

    #[test]
    fn extracts_google_translation_segments() {
        let payload = serde_json::json!([
            [
                [
                    "OpenAI 发布智能体功能\n",
                    "OpenAI announces agent features\n"
                ],
                ["一条简短更新。", "A concise update."]
            ],
            null,
            "en"
        ]);

        assert_eq!(
            extract_google_translation(&payload).as_deref(),
            Some("OpenAI 发布智能体功能\n一条简短更新。")
        );
    }

    #[test]
    fn applies_translated_media_title_and_summary() {
        let now = now_ms();
        let mut item = test_item("media", now);
        item.title = "OpenAI announces agent features".to_string();
        item.summary = Some("A concise update.".to_string());

        apply_translated_item_text(&mut item, "OpenAI 发布智能体功能\n一条简短更新。");

        assert_eq!(item.title_zh.as_deref(), Some("OpenAI 发布智能体功能"));
        assert_eq!(item.summary_zh.as_deref(), Some("一条简短更新。"));
    }

    #[test]
    fn applies_translated_github_summary_without_renaming_repository() {
        let now = now_ms();
        let mut item = test_item("github", now);
        item.channel = AiRadarChannel::Github;
        item.title = "example/agent-framework".to_string();
        item.summary = Some("A framework for building autonomous agents.".to_string());

        apply_translated_item_text(&mut item, "用于构建自主智能体的框架。");

        assert_eq!(item.title_zh, None);
        assert_eq!(
            item.summary_zh.as_deref(),
            Some("用于构建自主智能体的框架。")
        );
    }

    #[test]
    fn skips_translation_when_media_text_is_already_chinese() {
        let now = now_ms();
        let mut item = test_item("media", now);
        item.title = "OpenAI 发布智能体功能".to_string();
        item.summary = Some("一条简短更新。".to_string());

        assert!(!item_needs_chinese_translation(&item));
    }

    #[test]
    fn skips_translation_when_chinese_fields_are_already_present() {
        let now = now_ms();
        let mut media = test_item("media", now);
        media.title = "OpenAI announces agent features".to_string();
        media.summary = Some("A concise update.".to_string());
        media.title_zh = Some("OpenAI 发布智能体功能".to_string());
        media.summary_zh = Some("一条简短更新。".to_string());
        assert!(!item_needs_chinese_translation(&media));

        let mut github = test_item("github", now);
        github.channel = AiRadarChannel::Github;
        github.title = "example/agent-framework".to_string();
        github.summary = Some("A framework for building autonomous agents.".to_string());
        github.summary_zh = Some("用于构建自主智能体的框架。".to_string());
        assert!(!item_needs_chinese_translation(&github));
    }

    #[test]
    fn merges_translation_backfill_without_overwriting_latest_cache() {
        let now = now_ms();
        let mut latest = test_item("media", now);
        latest.id = "stable-id".to_string();
        latest.title = "OpenAI announces agent features".to_string();
        latest.summary = Some("A concise update.".to_string());
        latest.score = 99.0;
        latest.tags = vec!["fresh".to_string()];

        let mut refreshed = test_item("changed", now);
        refreshed.id = "changed-id".to_string();
        refreshed.title = "Fresh title".to_string();
        refreshed.summary = Some("Fresh summary".to_string());

        let mut translated = latest.clone();
        translated.score = 1.0;
        translated.tags = vec!["stale".to_string()];
        translated.title_zh = Some("OpenAI 发布智能体功能".to_string());
        translated.summary_zh = Some("一条简短更新。".to_string());

        let mut stale_translation = refreshed.clone();
        stale_translation.title = "Stale title".to_string();
        stale_translation.summary = Some("Stale summary".to_string());
        stale_translation.title_zh = Some("旧标题".to_string());
        stale_translation.summary_zh = Some("旧摘要".to_string());

        let mut cache = AiRadarCache {
            items: vec![latest, refreshed],
            source_states: Vec::new(),
            last_refreshed_at_ms: Some(456),
        };

        assert!(merge_translations_into_cache(
            &mut cache,
            &[translated, stale_translation]
        ));
        assert_eq!(
            cache.items[0].title_zh.as_deref(),
            Some("OpenAI 发布智能体功能")
        );
        assert_eq!(cache.items[0].summary_zh.as_deref(), Some("一条简短更新。"));
        assert_eq!(cache.items[0].score, 99.0);
        assert_eq!(cache.items[0].tags, vec!["fresh"]);
        assert_eq!(cache.items[1].title_zh, None);
        assert_eq!(cache.items[1].summary_zh, None);
        assert_eq!(cache.last_refreshed_at_ms, Some(456));
    }

    #[test]
    fn filters_items_for_removed_sources() {
        let now = now_ms();
        let mut disabled_source = test_source("disabled");
        disabled_source.enabled = false;
        let settings = AiRadarSettings {
            enabled: true,
            refresh_interval_minutes: 60,
            max_items: 20,
            retention_days: 30,
            translate_to_chinese: true,
            default_source_version: 5,
            sources: vec![test_source("active"), disabled_source],
        };
        let response = build_response(
            settings,
            AiRadarCache {
                items: vec![
                    test_item("active", now),
                    test_item("disabled", now),
                    test_item("removed", now),
                ],
                source_states: vec![
                    test_source_state("active"),
                    test_source_state("disabled"),
                    test_source_state("removed"),
                ],
                last_refreshed_at_ms: Some(123),
            },
        );

        assert_eq!(response.items.len(), 1);
        assert_eq!(response.items[0].source_id, "active");
        assert_eq!(response.status.source_states.len(), 1);
        assert_eq!(response.status.source_states[0].source_id, "active");
    }

    #[test]
    fn upgrades_legacy_default_sources() {
        let settings = AiRadarSettings {
            enabled: true,
            refresh_interval_minutes: 60,
            max_items: 800,
            retention_days: 30,
            translate_to_chinese: true,
            default_source_version: 0,
            sources: vec![
                AiRadarSource {
                    id: "github-ai-projects".to_string(),
                    name: "GitHub AI Projects".to_string(),
                    kind: AiRadarSourceKind::GithubSearch,
                    url: None,
                    query: Some("topic:ai stars:>500 archived:false".to_string()),
                    enabled: true,
                    channel: AiRadarChannel::Github,
                    created_at_ms: None,
                },
                AiRadarSource {
                    id: "media-the-decoder".to_string(),
                    name: "The Decoder".to_string(),
                    kind: AiRadarSourceKind::Rss,
                    url: Some("https://the-decoder.com/feed/".to_string()),
                    query: None,
                    enabled: true,
                    channel: AiRadarChannel::Media,
                    created_at_ms: None,
                },
            ],
        };

        let normalized = normalize_runtime_settings(settings);
        let source_ids = normalized
            .sources
            .iter()
            .map(|source| source.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            normalized.default_source_version,
            AppSettings::default().ai_radar.default_source_version
        );
        assert!(source_ids.contains(&"media-openai-news"));
        assert!(source_ids.contains(&"media-venturebeat-ai"));
        assert!(source_ids.contains(&"media-mit-ai"));
        assert!(source_ids.contains(&"media-anthropic-news"));
        assert!(source_ids.contains(&"media-arxiv-agent-memory-context"));
        assert!(source_ids.contains(&"media-wechat-jiqizhixin"));
        assert!(source_ids.contains(&"media-toutiao-ai-teaching"));
        assert!(!source_ids.contains(&"media-the-decoder"));
        assert!(source_ids.contains(&"github-ai-agent-topic"));
        assert!(source_ids.contains(&"github-agent-framework-topic"));
        assert!(source_ids.contains(&"github-agent-memory-topic"));
        assert!(source_ids.contains(&"github-long-context-topic"));
        assert!(source_ids.contains(&"github-context-engineering-topic"));
        assert!(source_ids.contains(&"github-ai-projects"));
        assert!(source_ids.contains(&"models-openrouter-weekly"));
    }

    #[test]
    fn resolves_wechat_and_toutiao_rsshub_routes() {
        let wechat = AiRadarSource {
            id: "wechat".to_string(),
            name: "WeChat".to_string(),
            kind: AiRadarSourceKind::WechatOfficialAccount,
            url: None,
            query: Some("813oxJOl".to_string()),
            enabled: true,
            channel: AiRadarChannel::Media,
            created_at_ms: None,
        };
        let toutiao = AiRadarSource {
            id: "toutiao".to_string(),
            name: "Toutiao".to_string(),
            kind: AiRadarSourceKind::ToutiaoUser,
            url: None,
            query: Some(
                "MS4wLjABAAAAEmbqJP2CmC8XXv1BpMvQ3sQHKAxFsq8wHxj8XVIQWja6tMcB-QEbFkzkRNgMl12M"
                    .to_string(),
            ),
            enabled: true,
            channel: AiRadarChannel::Media,
            created_at_ms: None,
        };
        let route = AiRadarSource {
            id: "wechat-route".to_string(),
            name: "WeChat Route".to_string(),
            kind: AiRadarSourceKind::WechatOfficialAccount,
            url: None,
            query: Some("/wechat/ershicimi/813oxJOl".to_string()),
            enabled: true,
            channel: AiRadarChannel::Media,
            created_at_ms: None,
        };

        assert_eq!(
            source_feed_url(&wechat).as_deref(),
            Ok("https://rsshub.chn.moe/wechat/ershicimi/813oxJOl")
        );
        assert_eq!(
            source_feed_url(&toutiao).as_deref(),
            Ok(
                "https://rsshub.chn.moe/toutiao/user/token/MS4wLjABAAAAEmbqJP2CmC8XXv1BpMvQ3sQHKAxFsq8wHxj8XVIQWja6tMcB-QEbFkzkRNgMl12M"
            )
        );
        assert_eq!(
            source_feed_url(&route).as_deref(),
            Ok("https://rsshub.chn.moe/wechat/ershicimi/813oxJOl")
        );
    }

    #[test]
    fn scheduler_is_due_when_enabled_sources_have_not_been_fetched() {
        let now = now_ms();
        let settings = AiRadarSettings {
            enabled: true,
            refresh_interval_minutes: 60,
            max_items: 800,
            retention_days: 30,
            translate_to_chinese: true,
            default_source_version: 5,
            sources: vec![test_source("media-openai-news")],
        };
        let status = scheduler_status_for_cache(
            &settings,
            &AiRadarCache {
                items: Vec::new(),
                source_states: Vec::new(),
                last_refreshed_at_ms: Some(now),
            },
            now,
        );

        assert!(status.due);
    }

    #[test]
    fn refreshes_owned_default_sources_during_version_upgrade() {
        let settings = AiRadarSettings {
            enabled: true,
            refresh_interval_minutes: 60,
            max_items: 800,
            retention_days: 30,
            translate_to_chinese: true,
            default_source_version: 2,
            sources: vec![AiRadarSource {
                id: "github-ai-agent-topic".to_string(),
                name: "GitHub AI agent".to_string(),
                kind: AiRadarSourceKind::GithubSearch,
                url: None,
                query: Some("topic:ai-agent stars:>50 archived:false fork:false".to_string()),
                enabled: true,
                channel: AiRadarChannel::Github,
                created_at_ms: None,
            }],
        };

        let normalized = normalize_runtime_settings(settings);
        let source = normalized
            .sources
            .iter()
            .find(|source| source.id == "github-ai-agent-topic")
            .expect("default source");

        assert_eq!(
            normalized.default_source_version,
            AppSettings::default().ai_radar.default_source_version
        );
        assert_eq!(source.name, "GitHub LLM agents");
        assert_eq!(
            source.query.as_deref(),
            Some("agent topic:llm stars:>100 archived:false fork:false")
        );
    }

    #[test]
    fn empty_scoped_refresh_does_not_advance_scheduler() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        runtime.block_on(async {
            let dir = std::env::temp_dir().join(format!("codexbuddy-ai-radar-{}", now_ms()));
            let settings_path = dir.join("settings.json");
            let cache_file = cache_path(&settings_path);
            let previous_refresh = Some(123_456);
            write_cache(
                &cache_file,
                &AiRadarCache {
                    items: Vec::new(),
                    source_states: Vec::new(),
                    last_refreshed_at_ms: previous_refresh,
                },
            )
            .await
            .expect("write cache");
            let mut settings = AppSettings::default();
            settings.ai_radar.sources = vec![AiRadarSource {
                id: "github-only".to_string(),
                name: "GitHub Only".to_string(),
                kind: AiRadarSourceKind::GithubSearch,
                url: None,
                query: Some("agent topic:llm stars:>100 archived:false fork:false".to_string()),
                enabled: true,
                channel: AiRadarChannel::Github,
                created_at_ms: None,
            }];
            let app_settings = Mutex::new(settings);

            let response = ai_radar_refresh_core(
                &app_settings,
                &settings_path,
                AiRadarRefreshRequest {
                    channel: Some(AiRadarChannel::Media),
                    source_id: None,
                },
            )
            .await
            .expect("refresh");

            assert_eq!(response.status.last_refreshed_at_ms, previous_refresh);
            assert_eq!(
                read_cache(&cache_file).await.last_refreshed_at_ms,
                previous_refresh
            );
            let _ = tokio::fs::remove_dir_all(dir).await;
        });
    }

    #[test]
    fn matching_scoped_refresh_does_not_advance_global_scheduler_time() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        runtime.block_on(async {
            let dir = std::env::temp_dir().join(format!("codexbuddy-ai-radar-{}", now_ms()));
            let settings_path = dir.join("settings.json");
            let cache_file = cache_path(&settings_path);
            let previous_refresh = Some(123_456);
            write_cache(
                &cache_file,
                &AiRadarCache {
                    items: Vec::new(),
                    source_states: Vec::new(),
                    last_refreshed_at_ms: previous_refresh,
                },
            )
            .await
            .expect("write cache");
            let mut settings = AppSettings::default();
            settings.ai_radar.sources = vec![AiRadarSource {
                id: "media-only".to_string(),
                name: "Media Only".to_string(),
                kind: AiRadarSourceKind::Rss,
                url: Some("http://127.0.0.1/feed.xml".to_string()),
                query: None,
                enabled: true,
                channel: AiRadarChannel::Media,
                created_at_ms: Some(1),
            }];
            let app_settings = Mutex::new(settings);

            let response = ai_radar_refresh_core(
                &app_settings,
                &settings_path,
                AiRadarRefreshRequest {
                    channel: Some(AiRadarChannel::Media),
                    source_id: None,
                },
            )
            .await
            .expect("refresh");
            let cache = read_cache(&cache_file).await;
            let state = cache
                .source_states
                .iter()
                .find(|state| state.source_id == "media-only")
                .expect("source state");

            assert_eq!(response.status.last_refreshed_at_ms, previous_refresh);
            assert_eq!(cache.last_refreshed_at_ms, previous_refresh);
            assert!(state.last_fetched_at_ms.is_some());
            assert!(state.last_error.is_some());
            let _ = tokio::fs::remove_dir_all(dir).await;
        });
    }

    fn test_source(id: &str) -> AiRadarSource {
        AiRadarSource {
            id: id.to_string(),
            name: id.to_string(),
            kind: AiRadarSourceKind::Rss,
            url: Some("https://example.com/feed.xml".to_string()),
            query: None,
            enabled: true,
            channel: AiRadarChannel::Media,
            created_at_ms: None,
        }
    }

    fn test_source_state(id: &str) -> AiRadarSourceState {
        AiRadarSourceState {
            source_id: id.to_string(),
            source_name: id.to_string(),
            ok: true,
            last_fetched_at_ms: Some(123),
            last_error: None,
            item_count: 1,
        }
    }

    fn test_item(source_id: &str, now: i64) -> AiRadarItem {
        AiRadarItem {
            id: format!("{source_id}-item"),
            channel: AiRadarChannel::Media,
            source_id: source_id.to_string(),
            source_name: source_id.to_string(),
            title: source_id.to_string(),
            summary: None,
            title_zh: None,
            summary_zh: None,
            url: format!("https://example.com/{source_id}"),
            published_at_ms: Some(now),
            fetched_at_ms: now,
            score: 1.0,
            tags: Vec::new(),
            metrics: AiRadarItemMetrics::default(),
        }
    }
}
