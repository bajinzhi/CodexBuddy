use super::*;

async fn serialize_result<T, Fut>(future: Fut) -> Result<Value, String>
where
    T: Serialize,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    match future.await {
        Ok(value) => serde_json::to_value(value).map_err(|err| err.to_string()),
        Err(err) => Err(err),
    }
}

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    match method {
        "ai_radar_list" => Some(serialize_result(state.ai_radar_list()).await),
        "ai_radar_refresh" => {
            let request = params
                .as_object()
                .and_then(|map| map.get("request").cloned())
                .map(serde_json::from_value::<AiRadarRefreshRequest>)
                .transpose()
                .map_err(|err| err.to_string());
            let request = match request {
                Ok(value) => value.unwrap_or_default(),
                Err(err) => return Some(Err(err)),
            };
            Some(serialize_result(state.ai_radar_refresh(request)).await)
        }
        "ai_radar_sources_get" => Some(
            serde_json::to_value(state.ai_radar_sources_get().await).map_err(|err| err.to_string()),
        ),
        "ai_radar_sources_update" => {
            let settings = params
                .as_object()
                .and_then(|map| map.get("settings").cloned())
                .ok_or_else(|| "missing `settings`".to_string())
                .and_then(|value| {
                    serde_json::from_value::<AiRadarSettings>(value).map_err(|err| err.to_string())
                });
            let settings = match settings {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serialize_result(state.ai_radar_sources_update(settings)).await)
        }
        "ai_radar_scheduler_status" => Some(
            serde_json::to_value(state.ai_radar_scheduler_status().await)
                .map_err(|err| err.to_string()),
        ),
        _ => None,
    }
}
