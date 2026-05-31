use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{Datelike, Duration, Local, LocalResult, NaiveDate, NaiveTime, TimeZone};
use serde::{Deserialize, Serialize};
use tokio::fs;
use tokio::sync::Mutex;
use uuid::Uuid;

const AUTOMATIONS_FILE_NAME: &str = "automations.json";
const MAX_RUNS: usize = 200;
const MAX_INTERVAL_MINUTES: u32 = 365 * 24 * 60;
const MAX_RECURRING_ITERATIONS: usize = 10_000;
const STALE_RUNNING_RUN_TIMEOUT_MS: i64 = 6 * 60 * 60 * 1_000;
const STALE_RUNNING_RUN_ERROR: &str = "Automation run timed out before completion";

static STATE_WRITE_LOCKS: OnceLock<StdMutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationState {
    #[serde(default)]
    pub(crate) tasks: Vec<AutomationTask>,
    #[serde(default)]
    pub(crate) runs: Vec<AutomationRun>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationTask {
    pub(crate) id: String,
    pub(crate) title: String,
    #[serde(default = "default_enabled")]
    pub(crate) enabled: bool,
    pub(crate) workspace_id: String,
    pub(crate) prompt: String,
    pub(crate) schedule: AutomationSchedule,
    #[serde(default)]
    pub(crate) thread_policy: AutomationThreadPolicy,
    #[serde(default)]
    pub(crate) execution_defaults: AutomationExecutionDefaults,
    #[serde(default)]
    pub(crate) created_at_ms: i64,
    #[serde(default)]
    pub(crate) updated_at_ms: i64,
    #[serde(default)]
    pub(crate) last_triggered_at_ms: Option<i64>,
    #[serde(default)]
    pub(crate) next_run_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum AutomationSchedule {
    #[serde(rename = "once")]
    Once {
        #[serde(rename = "runAtMs")]
        run_at_ms: i64,
    },
    #[serde(rename = "daily")]
    Daily {
        #[serde(rename = "timeMinutes")]
        time_minutes: u16,
    },
    #[serde(rename = "weekly")]
    Weekly {
        #[serde(rename = "daysOfWeek")]
        days_of_week: Vec<u8>,
        #[serde(rename = "timeMinutes")]
        time_minutes: u16,
    },
    #[serde(rename = "monthly")]
    Monthly {
        #[serde(rename = "dayOfMonth")]
        day_of_month: u8,
        #[serde(rename = "timeMinutes")]
        time_minutes: u16,
    },
    #[serde(rename = "interval")]
    Interval {
        #[serde(rename = "intervalMinutes")]
        interval_minutes: u32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub(crate) enum AutomationThreadPolicy {
    #[serde(rename = "new")]
    New,
    #[serde(rename = "continue")]
    Continue {
        #[serde(rename = "threadId")]
        thread_id: String,
    },
}

impl Default for AutomationThreadPolicy {
    fn default() -> Self {
        Self::New
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationExecutionDefaults {
    #[serde(default)]
    pub(crate) model_id: Option<String>,
    #[serde(default)]
    pub(crate) reasoning_effort: Option<String>,
    #[serde(default)]
    pub(crate) service_tier: Option<String>,
    #[serde(default)]
    pub(crate) access_mode: Option<String>,
    #[serde(default)]
    pub(crate) collaboration_mode: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AutomationRunStatus {
    Running,
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationRun {
    pub(crate) id: String,
    pub(crate) task_id: String,
    pub(crate) task_title: String,
    pub(crate) workspace_id: String,
    pub(crate) prompt: String,
    pub(crate) status: AutomationRunStatus,
    pub(crate) scheduled_for_ms: i64,
    pub(crate) started_at_ms: i64,
    #[serde(default)]
    pub(crate) finished_at_ms: Option<i64>,
    #[serde(default)]
    pub(crate) thread_id: Option<String>,
    #[serde(default)]
    pub(crate) error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationClaimedRun {
    pub(crate) task: AutomationTask,
    pub(crate) run: AutomationRun,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationClaimResponse {
    pub(crate) claims: Vec<AutomationClaimedRun>,
    pub(crate) state: AutomationState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationRunUpdateRequest {
    pub(crate) run_id: String,
    pub(crate) status: AutomationRunStatus,
    #[serde(default)]
    pub(crate) thread_id: Option<String>,
    #[serde(default)]
    pub(crate) error: Option<String>,
    #[serde(default)]
    pub(crate) finished_at_ms: Option<i64>,
}

fn default_enabled() -> bool {
    true
}

pub(crate) async fn automations_list_core(
    settings_path: &PathBuf,
) -> Result<AutomationState, String> {
    let state_file = automations_path(settings_path);
    read_state(&state_file).await
}

pub(crate) async fn automations_upsert_task_core(
    settings_path: &PathBuf,
    task: AutomationTask,
) -> Result<AutomationState, String> {
    let state_file = automations_path(settings_path);
    let state_lock = state_write_lock(&state_file);
    let _guard = state_lock.lock().await;
    let mut state = read_state(&state_file).await?;
    let now = now_ms();
    let existing = state.tasks.iter().find(|candidate| candidate.id == task.id);
    let normalized = normalize_task(task, existing, now)?;

    if let Some(index) = state
        .tasks
        .iter()
        .position(|candidate| candidate.id == normalized.id)
    {
        state.tasks[index] = normalized;
    } else {
        state.tasks.push(normalized);
    }

    write_state(&state_file, &state).await?;
    Ok(state)
}

pub(crate) async fn automations_delete_task_core(
    settings_path: &PathBuf,
    task_id: String,
) -> Result<AutomationState, String> {
    let state_file = automations_path(settings_path);
    let state_lock = state_write_lock(&state_file);
    let _guard = state_lock.lock().await;
    let mut state = read_state(&state_file).await?;
    state.tasks.retain(|task| task.id != task_id);
    write_state(&state_file, &state).await?;
    Ok(state)
}

pub(crate) async fn automations_set_task_enabled_core(
    settings_path: &PathBuf,
    task_id: String,
    enabled: bool,
) -> Result<AutomationState, String> {
    let state_file = automations_path(settings_path);
    let state_lock = state_write_lock(&state_file);
    let _guard = state_lock.lock().await;
    let mut state = read_state(&state_file).await?;
    let now = now_ms();
    let task = state
        .tasks
        .iter_mut()
        .find(|candidate| candidate.id == task_id)
        .ok_or_else(|| "Automation task not found".to_string())?;
    task.enabled = enabled;
    task.updated_at_ms = now;
    if enabled {
        task.next_run_at_ms = compute_initial_next_run(&task.schedule, now);
    }
    write_state(&state_file, &state).await?;
    Ok(state)
}

pub(crate) async fn automations_claim_due_core(
    settings_path: &PathBuf,
    now_ms_override: Option<i64>,
) -> Result<AutomationClaimResponse, String> {
    let state_file = automations_path(settings_path);
    let state_lock = state_write_lock(&state_file);
    let _guard = state_lock.lock().await;
    let mut state = read_state(&state_file).await?;
    let result =
        claim_due_runs_with_reconciliation(&mut state, now_ms_override.unwrap_or_else(now_ms));
    let claims = result.claims;
    if result.state_changed {
        write_state(&state_file, &state).await?;
    }
    Ok(AutomationClaimResponse { claims, state })
}

pub(crate) async fn automations_record_run_finished_core(
    settings_path: &PathBuf,
    request: AutomationRunUpdateRequest,
) -> Result<AutomationState, String> {
    let state_file = automations_path(settings_path);
    let state_lock = state_write_lock(&state_file);
    let _guard = state_lock.lock().await;
    let mut state = read_state(&state_file).await?;
    record_run_finished(
        &mut state,
        &request.run_id,
        request.status,
        request.thread_id,
        request.error,
        request.finished_at_ms.unwrap_or_else(now_ms),
    )?;
    write_state(&state_file, &state).await?;
    Ok(state)
}

#[cfg(test)]
fn claim_due_runs(state: &mut AutomationState, now: i64) -> Vec<AutomationClaimedRun> {
    claim_due_runs_with_reconciliation(state, now).claims
}

struct ClaimDueResult {
    claims: Vec<AutomationClaimedRun>,
    state_changed: bool,
}

fn claim_due_runs_with_reconciliation(state: &mut AutomationState, now: i64) -> ClaimDueResult {
    let stale_reconciled = reconcile_stale_running_runs(state, now);
    let running_task_ids = state
        .runs
        .iter()
        .filter(|run| run.status == AutomationRunStatus::Running)
        .map(|run| run.task_id.clone())
        .collect::<HashSet<_>>();
    let existing_schedules = state
        .runs
        .iter()
        .map(|run| (run.task_id.clone(), run.scheduled_for_ms))
        .collect::<HashSet<_>>();

    let mut claims = Vec::new();
    for task in &mut state.tasks {
        if !task.enabled || running_task_ids.contains(&task.id) {
            continue;
        }
        let Some(scheduled_for_ms) = latest_due_at_or_before(task, now) else {
            continue;
        };
        if existing_schedules.contains(&(task.id.clone(), scheduled_for_ms)) {
            task.next_run_at_ms = compute_next_run_after_now(task, now);
            continue;
        }

        let run = AutomationRun {
            id: format!("run-{}-{}", now, Uuid::new_v4()),
            task_id: task.id.clone(),
            task_title: task.title.clone(),
            workspace_id: task.workspace_id.clone(),
            prompt: task.prompt.clone(),
            status: AutomationRunStatus::Running,
            scheduled_for_ms,
            started_at_ms: now,
            finished_at_ms: None,
            thread_id: None,
            error: None,
        };
        task.last_triggered_at_ms = Some(scheduled_for_ms);
        task.next_run_at_ms = compute_next_run_after_now(task, now);
        claims.push(AutomationClaimedRun {
            task: task.clone(),
            run: run.clone(),
        });
        state.runs.insert(0, run);
    }

    if state.runs.len() > MAX_RUNS {
        state.runs.truncate(MAX_RUNS);
    }
    let state_changed = stale_reconciled || !claims.is_empty();
    ClaimDueResult {
        claims,
        state_changed,
    }
}

fn reconcile_stale_running_runs(state: &mut AutomationState, now: i64) -> bool {
    let mut changed = false;
    for run in &mut state.runs {
        if run.status != AutomationRunStatus::Running {
            continue;
        }
        if now.saturating_sub(run.started_at_ms) <= STALE_RUNNING_RUN_TIMEOUT_MS {
            continue;
        }
        run.status = AutomationRunStatus::Failed;
        run.finished_at_ms = Some(now);
        run.error = Some(STALE_RUNNING_RUN_ERROR.to_string());
        changed = true;
    }
    changed
}

pub(crate) fn record_run_finished(
    state: &mut AutomationState,
    run_id: &str,
    status: AutomationRunStatus,
    thread_id: Option<String>,
    error: Option<String>,
    finished_at_ms: i64,
) -> Result<(), String> {
    let run = state
        .runs
        .iter_mut()
        .find(|candidate| candidate.id == run_id)
        .ok_or_else(|| "Automation run not found".to_string())?;
    run.status = status;
    if thread_id.is_some() {
        run.thread_id = thread_id;
    }
    run.error = error;
    run.finished_at_ms = Some(finished_at_ms);
    Ok(())
}

fn normalize_task(
    mut task: AutomationTask,
    existing: Option<&AutomationTask>,
    now: i64,
) -> Result<AutomationTask, String> {
    task.id = task.id.trim().to_string();
    if task.id.is_empty() {
        task.id = format!("automation-{}", Uuid::new_v4());
    }
    task.title = task.title.trim().to_string();
    if task.title.is_empty() {
        task.title = "Automation".to_string();
    }
    task.workspace_id = task.workspace_id.trim().to_string();
    if task.workspace_id.is_empty() {
        return Err("Workspace is required".to_string());
    }
    task.prompt = task.prompt.trim().to_string();
    if task.prompt.is_empty() {
        return Err("Prompt is required".to_string());
    }
    task.schedule = normalize_schedule(task.schedule)?;
    task.thread_policy = normalize_thread_policy(task.thread_policy)?;
    task.execution_defaults = normalize_execution_defaults(task.execution_defaults);
    task.created_at_ms = existing
        .map(|previous| previous.created_at_ms)
        .filter(|value| *value > 0)
        .unwrap_or(now);
    task.updated_at_ms = now;
    task.last_triggered_at_ms = existing
        .and_then(|previous| previous.last_triggered_at_ms)
        .or(task.last_triggered_at_ms);

    let schedule_changed = existing
        .map(|previous| previous.schedule != task.schedule)
        .unwrap_or(true);
    let reenabled = existing
        .map(|previous| !previous.enabled && task.enabled)
        .unwrap_or(false);
    task.next_run_at_ms = if task.enabled
        && (schedule_changed
            || reenabled
            || existing
                .and_then(|previous| previous.next_run_at_ms)
                .is_none())
    {
        compute_initial_next_run(&task.schedule, now)
    } else {
        existing
            .and_then(|previous| previous.next_run_at_ms)
            .or_else(|| compute_initial_next_run(&task.schedule, now))
    };

    Ok(task)
}

fn normalize_schedule(schedule: AutomationSchedule) -> Result<AutomationSchedule, String> {
    Ok(match schedule {
        AutomationSchedule::Once { run_at_ms } => {
            if run_at_ms <= 0 {
                return Err("Run time is required".to_string());
            }
            AutomationSchedule::Once { run_at_ms }
        }
        AutomationSchedule::Daily { time_minutes } => AutomationSchedule::Daily {
            time_minutes: time_minutes.min(1_439),
        },
        AutomationSchedule::Weekly {
            days_of_week,
            time_minutes,
        } => {
            let mut normalized = days_of_week
                .into_iter()
                .filter(|day| *day <= 6)
                .collect::<Vec<_>>();
            normalized.sort_unstable();
            normalized.dedup();
            if normalized.is_empty() {
                return Err("At least one weekday is required".to_string());
            }
            AutomationSchedule::Weekly {
                days_of_week: normalized,
                time_minutes: time_minutes.min(1_439),
            }
        }
        AutomationSchedule::Monthly {
            day_of_month,
            time_minutes,
        } => AutomationSchedule::Monthly {
            day_of_month: day_of_month.clamp(1, 31),
            time_minutes: time_minutes.min(1_439),
        },
        AutomationSchedule::Interval { interval_minutes } => AutomationSchedule::Interval {
            interval_minutes: interval_minutes.clamp(1, MAX_INTERVAL_MINUTES),
        },
    })
}

fn normalize_thread_policy(
    policy: AutomationThreadPolicy,
) -> Result<AutomationThreadPolicy, String> {
    match policy {
        AutomationThreadPolicy::New => Ok(AutomationThreadPolicy::New),
        AutomationThreadPolicy::Continue { thread_id } => {
            let thread_id = thread_id.trim().to_string();
            if thread_id.is_empty() {
                return Err("Thread id is required when continuing a thread".to_string());
            }
            Ok(AutomationThreadPolicy::Continue { thread_id })
        }
    }
}

fn normalize_execution_defaults(
    defaults: AutomationExecutionDefaults,
) -> AutomationExecutionDefaults {
    AutomationExecutionDefaults {
        model_id: normalize_optional_string(defaults.model_id),
        reasoning_effort: normalize_optional_string(defaults.reasoning_effort),
        service_tier: normalize_optional_string(defaults.service_tier),
        access_mode: normalize_optional_string(defaults.access_mode),
        collaboration_mode: defaults.collaboration_mode,
    }
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|candidate| {
        let normalized = candidate.trim().to_string();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    })
}

fn latest_due_at_or_before(task: &AutomationTask, now: i64) -> Option<i64> {
    let next = task
        .next_run_at_ms
        .or_else(|| compute_initial_next_run(&task.schedule, task.updated_at_ms))?;
    if next > now {
        return None;
    }

    let latest = match task.schedule {
        AutomationSchedule::Interval { interval_minutes } => {
            let interval_ms = interval_minutes_to_ms(interval_minutes)?;
            let elapsed = now.saturating_sub(next);
            next.saturating_add((elapsed / interval_ms).saturating_mul(interval_ms))
        }
        AutomationSchedule::Once { run_at_ms } => run_at_ms,
        _ => latest_recurring_due(&task.schedule, next, now)?,
    };

    if task
        .last_triggered_at_ms
        .is_some_and(|last_triggered_at_ms| latest <= last_triggered_at_ms)
    {
        return None;
    }
    Some(latest)
}

fn compute_initial_next_run(schedule: &AutomationSchedule, now: i64) -> Option<i64> {
    match schedule {
        AutomationSchedule::Interval { interval_minutes } => {
            interval_minutes_to_ms(*interval_minutes)
                .and_then(|interval_ms| now.checked_add(interval_ms))
        }
        _ => compute_next_calendar_run(schedule, now.saturating_add(1)),
    }
}

fn compute_next_run_after_now(task: &AutomationTask, now: i64) -> Option<i64> {
    match task.schedule {
        AutomationSchedule::Interval { interval_minutes } => {
            let interval_ms = interval_minutes_to_ms(interval_minutes)?;
            let baseline = task.last_triggered_at_ms.or(task.next_run_at_ms)?;
            let mut next = baseline.checked_add(interval_ms)?;
            if next <= now {
                let missed = now.saturating_sub(next) / interval_ms + 1;
                next = next.checked_add(missed.checked_mul(interval_ms)?)?;
            }
            Some(next)
        }
        _ => compute_next_calendar_run(&task.schedule, now.saturating_add(1)),
    }
}

fn latest_recurring_due(schedule: &AutomationSchedule, first_due: i64, now: i64) -> Option<i64> {
    let mut latest = first_due;
    for _ in 0..MAX_RECURRING_ITERATIONS {
        let Some(next) = compute_next_calendar_run(schedule, latest.saturating_add(1)) else {
            break;
        };
        if next > now {
            break;
        }
        latest = next;
    }
    Some(latest)
}

fn compute_next_calendar_run(schedule: &AutomationSchedule, after_ms: i64) -> Option<i64> {
    match schedule {
        AutomationSchedule::Once { run_at_ms } => {
            if *run_at_ms >= after_ms {
                Some(*run_at_ms)
            } else {
                None
            }
        }
        AutomationSchedule::Daily { time_minutes } => {
            let after = Local.timestamp_millis_opt(after_ms).earliest()?;
            let time = time_from_minutes(*time_minutes);
            for offset in 0..=2 {
                let date = after
                    .date_naive()
                    .checked_add_signed(Duration::days(offset))?;
                let candidate = local_datetime_ms(date, time)?;
                if candidate >= after_ms {
                    return Some(candidate);
                }
            }
            None
        }
        AutomationSchedule::Weekly {
            days_of_week,
            time_minutes,
        } => {
            let after = Local.timestamp_millis_opt(after_ms).earliest()?;
            let time = time_from_minutes(*time_minutes);
            for offset in 0..=7 {
                let date = after
                    .date_naive()
                    .checked_add_signed(Duration::days(offset))?;
                let weekday = date.weekday().num_days_from_sunday() as u8;
                if !days_of_week.contains(&weekday) {
                    continue;
                }
                let candidate = local_datetime_ms(date, time)?;
                if candidate >= after_ms {
                    return Some(candidate);
                }
            }
            None
        }
        AutomationSchedule::Monthly {
            day_of_month,
            time_minutes,
        } => {
            let after = Local.timestamp_millis_opt(after_ms).earliest()?;
            let time = time_from_minutes(*time_minutes);
            let mut year = after.year();
            let mut month = after.month();
            for _ in 0..=120 {
                let max_day = days_in_month(year, month)?;
                let day = u32::from(*day_of_month).min(max_day);
                let date = NaiveDate::from_ymd_opt(year, month, day)?;
                let candidate = local_datetime_ms(date, time)?;
                if candidate >= after_ms {
                    return Some(candidate);
                }
                if month == 12 {
                    month = 1;
                    year += 1;
                } else {
                    month += 1;
                }
            }
            None
        }
        AutomationSchedule::Interval { .. } => compute_initial_next_run(schedule, after_ms),
    }
}

fn time_from_minutes(time_minutes: u16) -> NaiveTime {
    let normalized = time_minutes.min(1_439);
    NaiveTime::from_hms_opt(u32::from(normalized / 60), u32::from(normalized % 60), 0)
        .unwrap_or(NaiveTime::MIN)
}

fn local_datetime_ms(date: NaiveDate, time: NaiveTime) -> Option<i64> {
    let naive = date.and_time(time);
    match Local.from_local_datetime(&naive) {
        LocalResult::Single(value) => Some(value.timestamp_millis()),
        LocalResult::Ambiguous(first, second) => {
            Some(first.timestamp_millis().min(second.timestamp_millis()))
        }
        LocalResult::None => {
            for minute in 1..=180 {
                let shifted = naive.checked_add_signed(Duration::minutes(minute))?;
                match Local.from_local_datetime(&shifted) {
                    LocalResult::Single(value) => return Some(value.timestamp_millis()),
                    LocalResult::Ambiguous(first, second) => {
                        return Some(first.timestamp_millis().min(second.timestamp_millis()));
                    }
                    LocalResult::None => {}
                }
            }
            None
        }
    }
}

fn days_in_month(year: i32, month: u32) -> Option<u32> {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let next_month_first = NaiveDate::from_ymd_opt(next_year, next_month, 1)?;
    let last_day = next_month_first.checked_sub_signed(Duration::days(1))?;
    Some(last_day.day())
}

fn interval_minutes_to_ms(interval_minutes: u32) -> Option<i64> {
    i64::from(interval_minutes.clamp(1, MAX_INTERVAL_MINUTES)).checked_mul(60_000)
}

fn automations_path(settings_path: &Path) -> PathBuf {
    settings_path.with_file_name(AUTOMATIONS_FILE_NAME)
}

fn state_write_lock(path: &Path) -> Arc<Mutex<()>> {
    let locks = STATE_WRITE_LOCKS.get_or_init(|| StdMutex::new(HashMap::new()));
    let mut guard = locks
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard
        .entry(path.to_path_buf())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

async fn read_state(path: &Path) -> Result<AutomationState, String> {
    match fs::read_to_string(path).await {
        Ok(text) => {
            if text.trim().is_empty() {
                return Ok(AutomationState::default());
            }
            serde_json::from_str::<AutomationState>(&text).map_err(|err| err.to_string())
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(AutomationState::default()),
        Err(err) => Err(err.to_string()),
    }
}

async fn write_state(path: &Path, state: &AutomationState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string_pretty(state).map_err(|err| err.to_string())?;
    fs::write(path, text).await.map_err(|err| err.to_string())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn interval_task(next_run_at_ms: Option<i64>) -> AutomationTask {
        AutomationTask {
            id: "automation-1".to_string(),
            title: "Daily summary".to_string(),
            enabled: true,
            workspace_id: "workspace-1".to_string(),
            prompt: "Summarize the project state".to_string(),
            schedule: AutomationSchedule::Interval {
                interval_minutes: 30,
            },
            thread_policy: AutomationThreadPolicy::New,
            execution_defaults: AutomationExecutionDefaults::default(),
            created_at_ms: 1_000,
            updated_at_ms: 1_000,
            last_triggered_at_ms: None,
            next_run_at_ms,
        }
    }

    fn temp_settings_path(prefix: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!("codexbuddy-{prefix}-{}", Uuid::new_v4()))
            .join("settings.json")
    }

    #[test]
    fn test_rq_002_automation_core_claim_due_runs() {
        let mut state = AutomationState {
            tasks: vec![interval_task(Some(1_000))],
            runs: Vec::new(),
        };

        let claims = claim_due_runs(&mut state, 7_250_000);

        assert_eq!(claims.len(), 1);
        assert_eq!(claims[0].run.task_id, "automation-1");
        assert_eq!(claims[0].run.scheduled_for_ms, 7_201_000);
        assert_eq!(state.runs.len(), 1);
        assert_eq!(state.tasks[0].last_triggered_at_ms, Some(7_201_000));
        assert_eq!(state.tasks[0].next_run_at_ms, Some(9_001_000));

        record_run_finished(
            &mut state,
            &claims[0].run.id,
            AutomationRunStatus::Completed,
            Some("thread-1".to_string()),
            None,
            7_260_000,
        )
        .expect("run should be updated");

        assert!(claim_due_runs(&mut state, 7_260_000).is_empty());
    }

    #[test]
    fn test_rq_002_reclaims_stale_running_run_before_claiming_next_due() {
        let stale_started_at_ms = 7_250_000;
        let mut task = interval_task(Some(9_001_000));
        task.last_triggered_at_ms = Some(7_201_000);
        let mut state = AutomationState {
            tasks: vec![task],
            runs: vec![AutomationRun {
                id: "run-stale".to_string(),
                task_id: "automation-1".to_string(),
                task_title: "Daily summary".to_string(),
                workspace_id: "workspace-1".to_string(),
                prompt: "Summarize the project state".to_string(),
                status: AutomationRunStatus::Running,
                scheduled_for_ms: 7_201_000,
                started_at_ms: stale_started_at_ms,
                finished_at_ms: None,
                thread_id: None,
                error: None,
            }],
        };

        let claims = claim_due_runs(
            &mut state,
            stale_started_at_ms + STALE_RUNNING_RUN_TIMEOUT_MS + 1,
        );

        assert_eq!(claims.len(), 1);
        assert_eq!(claims[0].run.task_id, "automation-1");
        assert_eq!(state.runs[1].id, "run-stale");
        assert_eq!(state.runs[1].status, AutomationRunStatus::Failed);
        assert_eq!(
            state.runs[1].finished_at_ms,
            Some(stale_started_at_ms + STALE_RUNNING_RUN_TIMEOUT_MS + 1),
        );
        assert_eq!(
            state.runs[1].error.as_deref(),
            Some("Automation run timed out before completion"),
        );
    }

    #[test]
    fn test_rq_002_persists_stale_running_reconciliation_without_new_claim() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("create tokio runtime");
        runtime.block_on(async {
            let stale_started_at_ms = 7_250_000;
            let now = stale_started_at_ms + STALE_RUNNING_RUN_TIMEOUT_MS + 1;
            let mut task = interval_task(Some(now + 60_000));
            task.last_triggered_at_ms = Some(7_201_000);
            let settings_path = temp_settings_path("automation-stale");
            let state_file = automations_path(&settings_path);
            let state = AutomationState {
                tasks: vec![task],
                runs: vec![AutomationRun {
                    id: "run-stale".to_string(),
                    task_id: "automation-1".to_string(),
                    task_title: "Daily summary".to_string(),
                    workspace_id: "workspace-1".to_string(),
                    prompt: "Summarize the project state".to_string(),
                    status: AutomationRunStatus::Running,
                    scheduled_for_ms: 7_201_000,
                    started_at_ms: stale_started_at_ms,
                    finished_at_ms: None,
                    thread_id: None,
                    error: None,
                }],
            };
            write_state(&state_file, &state)
                .await
                .expect("write automation state");

            let response = automations_claim_due_core(&settings_path, Some(now))
                .await
                .expect("claim due automations");
            let persisted = read_state(&state_file)
                .await
                .expect("read persisted automation state");

            assert!(response.claims.is_empty());
            assert_eq!(response.state.runs[0].status, AutomationRunStatus::Failed);
            assert_eq!(persisted.runs[0].status, AutomationRunStatus::Failed);
            assert_eq!(persisted.runs[0].finished_at_ms, Some(now));
            assert_eq!(
                persisted.runs[0].error.as_deref(),
                Some("Automation run timed out before completion"),
            );

            if let Some(parent) = settings_path.parent() {
                let _ = fs::remove_dir_all(parent).await;
            }
        });
    }

    #[test]
    fn running_run_blocks_claim_until_stale_timeout() {
        let running_started_at_ms = 7_250_000;
        let mut task = interval_task(Some(9_001_000));
        task.last_triggered_at_ms = Some(7_201_000);
        let mut state = AutomationState {
            tasks: vec![task],
            runs: vec![AutomationRun {
                id: "run-active".to_string(),
                task_id: "automation-1".to_string(),
                task_title: "Daily summary".to_string(),
                workspace_id: "workspace-1".to_string(),
                prompt: "Summarize the project state".to_string(),
                status: AutomationRunStatus::Running,
                scheduled_for_ms: 7_201_000,
                started_at_ms: running_started_at_ms,
                finished_at_ms: None,
                thread_id: None,
                error: None,
            }],
        };

        let claims = claim_due_runs(
            &mut state,
            running_started_at_ms + STALE_RUNNING_RUN_TIMEOUT_MS - 1,
        );

        assert!(claims.is_empty());
        assert_eq!(state.runs[0].status, AutomationRunStatus::Running);
        assert_eq!(state.runs[0].finished_at_ms, None);
    }

    #[test]
    fn disabled_tasks_are_not_claimed() {
        let mut task = interval_task(Some(1_000));
        task.enabled = false;
        let mut state = AutomationState {
            tasks: vec![task],
            runs: Vec::new(),
        };

        assert!(claim_due_runs(&mut state, 7_250_000).is_empty());
        assert!(state.runs.is_empty());
    }
}
