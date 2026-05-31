use tauri::State;

use crate::shared::automations_core::{
    self, AutomationClaimResponse, AutomationRunUpdateRequest, AutomationState, AutomationTask,
};
use crate::state::AppState;

#[tauri::command]
pub(crate) async fn automations_list(
    state: State<'_, AppState>,
) -> Result<AutomationState, String> {
    automations_core::automations_list_core(&state.settings_path).await
}

#[tauri::command]
pub(crate) async fn automations_upsert_task(
    task: AutomationTask,
    state: State<'_, AppState>,
) -> Result<AutomationState, String> {
    automations_core::automations_upsert_task_core(&state.settings_path, task).await
}

#[tauri::command]
pub(crate) async fn automations_delete_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<AutomationState, String> {
    automations_core::automations_delete_task_core(&state.settings_path, task_id).await
}

#[tauri::command]
pub(crate) async fn automations_set_task_enabled(
    task_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<AutomationState, String> {
    automations_core::automations_set_task_enabled_core(&state.settings_path, task_id, enabled)
        .await
}

#[tauri::command]
pub(crate) async fn automations_claim_due(
    now_ms: Option<i64>,
    state: State<'_, AppState>,
) -> Result<AutomationClaimResponse, String> {
    automations_core::automations_claim_due_core(&state.settings_path, now_ms).await
}

#[tauri::command]
pub(crate) async fn automations_record_run_finished(
    request: AutomationRunUpdateRequest,
    state: State<'_, AppState>,
) -> Result<AutomationState, String> {
    automations_core::automations_record_run_finished_core(&state.settings_path, request).await
}
