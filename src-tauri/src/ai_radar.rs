use serde_json::json;
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::shared::ai_radar_core;
use crate::state::AppState;
use crate::types::{
    AiRadarListResponse, AiRadarRefreshRequest, AiRadarSchedulerStatus, AiRadarSettings,
};

#[tauri::command]
pub(crate) async fn ai_radar_list(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AiRadarListResponse, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response =
            remote_backend::call_remote(&*state, app, "ai_radar_list", json!({})).await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }
    ai_radar_core::ai_radar_list_core(&state.app_settings, &state.settings_path).await
}

#[tauri::command]
pub(crate) async fn ai_radar_refresh(
    request: Option<AiRadarRefreshRequest>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AiRadarListResponse, String> {
    let request = request.unwrap_or_default();
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "ai_radar_refresh",
            json!({ "request": request }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }
    ai_radar_core::ai_radar_refresh_core(&state.app_settings, &state.settings_path, request).await
}

#[tauri::command]
pub(crate) async fn ai_radar_sources_get(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AiRadarSettings, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response =
            remote_backend::call_remote(&*state, app, "ai_radar_sources_get", json!({})).await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }
    Ok(ai_radar_core::ai_radar_sources_get_core(&state.app_settings).await)
}

#[tauri::command]
pub(crate) async fn ai_radar_sources_update(
    settings: AiRadarSettings,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AiRadarSettings, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "ai_radar_sources_update",
            json!({ "settings": settings }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }
    ai_radar_core::ai_radar_sources_update_core(&state.app_settings, &state.settings_path, settings)
        .await
}

#[tauri::command]
pub(crate) async fn ai_radar_scheduler_status(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AiRadarSchedulerStatus, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response =
            remote_backend::call_remote(&*state, app, "ai_radar_scheduler_status", json!({}))
                .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }
    Ok(
        ai_radar_core::ai_radar_scheduler_status_core(&state.app_settings, &state.settings_path)
            .await,
    )
}
