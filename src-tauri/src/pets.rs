use serde_json::json;
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::shared::pets_core::{
    list_pets_core, read_pet_asset_core, PetAssetResponse, PetDefinitionResponse,
};
use crate::state::AppState;

async fn list_pets_impl(
    state: &AppState,
    app: &AppHandle,
) -> Result<Vec<PetDefinitionResponse>, String> {
    if remote_backend::is_remote_mode(state).await {
        let response =
            remote_backend::call_remote(state, app.clone(), "list_pets", json!({})).await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    list_pets_core()
}

async fn read_pet_asset_impl(
    pet_id: String,
    asset_path: String,
    state: &AppState,
    app: &AppHandle,
) -> Result<PetAssetResponse, String> {
    if remote_backend::is_remote_mode(state).await {
        let response = remote_backend::call_remote(
            state,
            app.clone(),
            "read_pet_asset",
            json!({ "petId": pet_id, "assetPath": asset_path }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    read_pet_asset_core(&pet_id, &asset_path)
}

#[tauri::command]
pub(crate) async fn list_pets(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<PetDefinitionResponse>, String> {
    list_pets_impl(&*state, &app).await
}

#[tauri::command]
pub(crate) async fn read_pet_asset(
    pet_id: String,
    asset_path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<PetAssetResponse, String> {
    read_pet_asset_impl(pet_id, asset_path, &*state, &app).await
}
