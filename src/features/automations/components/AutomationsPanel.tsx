import CalendarClock from "lucide-react/dist/esm/icons/calendar-clock";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import CircleAlert from "lucide-react/dist/esm/icons/circle-alert";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Plus from "lucide-react/dist/esm/icons/plus";
import Save from "lucide-react/dist/esm/icons/save";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import X from "lucide-react/dist/esm/icons/x";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AutomationExecutionDefaults,
  AutomationRun,
  AutomationSchedule,
  AutomationState,
  AutomationTask,
  AutomationThreadPolicy,
  WorkspaceInfo,
} from "@/types";
import {
  automationsDeleteTask,
  automationsList,
  automationsSetTaskEnabled,
  automationsUpsertTask,
} from "@services/tauri";

type AutomationsPanelProps = {
  workspaces: WorkspaceInfo[];
  defaultExecutionDefaults: AutomationExecutionDefaults;
  onClose: () => void;
  onOpenThread: (workspaceId: string, threadId: string) => void;
  onStateChange?: (state: AutomationState) => void;
};

type AutomationsTab = "tasks" | "runs";

const weekdayValues = [0, 1, 2, 3, 4, 5, 6];

function nowTimeMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function makeTaskDraft(
  workspaces: WorkspaceInfo[],
  defaults: AutomationExecutionDefaults,
): AutomationTask {
  const now = Date.now();
  return {
    id: `automation-${now}`,
    title: "",
    enabled: true,
    workspaceId: workspaces[0]?.id ?? "",
    prompt: "",
    schedule: {
      type: "daily",
      timeMinutes: nowTimeMinutes(),
    },
    threadPolicy: { mode: "new" },
    executionDefaults: defaults,
    createdAtMs: now,
    updatedAtMs: now,
    lastTriggeredAtMs: null,
    nextRunAtMs: null,
  };
}

function formatTime(value: number | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatInputDateTime(value: number) {
  const date = new Date(value);
  const pad = (candidate: number) => String(candidate).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function parseInputDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
}

function minutesToInput(value: number) {
  const normalized = Math.max(0, Math.min(1439, Math.round(value)));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function inputToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return nowTimeMinutes();
  }
  return Math.max(0, Math.min(1439, hours * 60 + minutes));
}

function taskWorkspaceName(task: AutomationTask, workspaces: WorkspaceInfo[]) {
  return workspaces.find((workspace) => workspace.id === task.workspaceId)?.name ?? task.workspaceId;
}

function scheduleLabel(schedule: AutomationSchedule, t: ReturnType<typeof useTranslation>["t"]) {
  if (schedule.type === "once") {
    return t("automations.schedule.onceAt", {
      time: formatTime(schedule.runAtMs, "-"),
    });
  }
  if (schedule.type === "daily") {
    return t("automations.schedule.dailyAt", {
      time: minutesToInput(schedule.timeMinutes),
    });
  }
  if (schedule.type === "weekly") {
    return t("automations.schedule.weeklyAt", {
      days: schedule.daysOfWeek
        .map((day) => t(`automations.weekdays.${day}`))
        .join(", "),
      time: minutesToInput(schedule.timeMinutes),
    });
  }
  if (schedule.type === "monthly") {
    return t("automations.schedule.monthlyAt", {
      day: schedule.dayOfMonth,
      time: minutesToInput(schedule.timeMinutes),
    });
  }
  return t("automations.schedule.interval", {
    minutes: schedule.intervalMinutes,
  });
}

function runStatusIcon(run: AutomationRun) {
  if (run.status === "completed") {
    return <CheckCircle2 size={14} aria-hidden />;
  }
  if (run.status === "failed" || run.status === "skipped") {
    return <CircleAlert size={14} aria-hidden />;
  }
  return <Clock3 size={14} aria-hidden />;
}

export function AutomationsPanel({
  workspaces,
  defaultExecutionDefaults,
  onClose,
  onOpenThread,
  onStateChange,
}: AutomationsPanelProps) {
  const { t } = useTranslation("app");
  const [tab, setTab] = useState<AutomationsTab>("tasks");
  const [state, setState] = useState<AutomationState>({ tasks: [], runs: [] });
  const [draft, setDraft] = useState<AutomationTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspaceOptions = useMemo(
    () => workspaces.map((workspace) => ({ id: workspace.id, label: workspace.name })),
    [workspaces],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextState = await automationsList();
      setState(nextState);
      onStateChange?.(nextState);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  }, [onStateChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateDraft = (updates: Partial<AutomationTask>) => {
    setDraft((current) => (current ? { ...current, ...updates } : current));
  };

  const updateDraftSchedule = (schedule: AutomationSchedule) => {
    updateDraft({ schedule });
  };

  const updateDraftThreadPolicy = (threadPolicy: AutomationThreadPolicy) => {
    updateDraft({ threadPolicy });
  };

  const handleSave = async () => {
    if (!draft || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nextState = await automationsUpsertTask({
        ...draft,
        executionDefaults: draft.executionDefaults ?? defaultExecutionDefaults,
      });
      setState(nextState);
      onStateChange?.(nextState);
      setDraft(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (task: AutomationTask) => {
    const nextState = await automationsSetTaskEnabled(task.id, !task.enabled);
    setState(nextState);
    onStateChange?.(nextState);
  };

  const handleDelete = async (task: AutomationTask) => {
    const nextState = await automationsDeleteTask(task.id);
    setState(nextState);
    onStateChange?.(nextState);
    if (draft?.id === task.id) {
      setDraft(null);
    }
  };

  const canSave = Boolean(draft?.workspaceId && draft?.prompt.trim());
  const activeTasks = state.tasks.filter((task) => task.enabled).length;
  const latestRuns = state.runs.slice(0, 80);

  return (
    <div className="automations-overlay" role="dialog" aria-modal="true" aria-labelledby="automations-title">
      <section className="automations-panel">
        <header className="automations-header">
          <div>
            <h2 id="automations-title">{t("automations.title")}</h2>
            <div className="automations-status-line">
              {t("automations.statusLine", {
                active: activeTasks,
                runs: state.runs.length,
              })}
            </div>
          </div>
          <div className="automations-header-actions">
            <button
              type="button"
              className="secondary automations-header-action"
              onClick={() => setDraft(makeTaskDraft(workspaces, defaultExecutionDefaults))}
            >
              <Plus size={14} aria-hidden />
              <span>{t("automations.actions.new")}</span>
            </button>
            <button
              type="button"
              className="ghost automations-icon-button ds-tooltip-trigger"
              onClick={onClose}
              aria-label={t("automations.closeAria")}
              title={t("automations.close")}
              data-tooltip={t("automations.close")}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="automations-tabs" role="tablist" aria-label={t("automations.tabsAria")}>
          <button
            type="button"
            className={tab === "tasks" ? "active" : ""}
            onClick={() => setTab("tasks")}
          >
            <CalendarClock size={14} aria-hidden />
            {t("automations.tabs.tasks")}
          </button>
          <button
            type="button"
            className={tab === "runs" ? "active" : ""}
            onClick={() => setTab("runs")}
          >
            <Clock3 size={14} aria-hidden />
            {t("automations.tabs.runs")}
          </button>
        </div>

        {error && (
          <div className="automations-error" role="alert">
            <CircleAlert size={14} aria-hidden />
            <span>{error}</span>
          </div>
        )}

        {tab === "tasks" ? (
          <div className="automations-body">
            {draft && (
              <form
                className="automations-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSave();
                }}
              >
                <label>
                  <span>{t("automations.fields.name")}</span>
                  <input
                    value={draft.title}
                    onChange={(event) => updateDraft({ title: event.target.value })}
                    aria-label={t("automations.fields.name")}
                  />
                </label>
                <label>
                  <span>{t("automations.fields.workspace")}</span>
                  <select
                    value={draft.workspaceId}
                    onChange={(event) => updateDraft({ workspaceId: event.target.value })}
                    aria-label={t("automations.fields.workspace")}
                  >
                    {workspaceOptions.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="automations-editor-wide">
                  <span>{t("automations.fields.prompt")}</span>
                  <textarea
                    value={draft.prompt}
                    onChange={(event) => updateDraft({ prompt: event.target.value })}
                    aria-label={t("automations.fields.prompt")}
                    rows={5}
                  />
                </label>

                <div className="automations-editor-grid">
                  <label>
                    <span>{t("automations.fields.scheduleType")}</span>
                    <select
                      value={draft.schedule.type}
                      onChange={(event) => {
                        const type = event.target.value as AutomationSchedule["type"];
                        if (type === "once") {
                          updateDraftSchedule({
                            type,
                            runAtMs: Date.now() + 60 * 60 * 1000,
                          });
                        } else if (type === "daily") {
                          updateDraftSchedule({ type, timeMinutes: nowTimeMinutes() });
                        } else if (type === "weekly") {
                          updateDraftSchedule({
                            type,
                            daysOfWeek: [new Date().getDay()],
                            timeMinutes: nowTimeMinutes(),
                          });
                        } else if (type === "monthly") {
                          updateDraftSchedule({
                            type,
                            dayOfMonth: new Date().getDate(),
                            timeMinutes: nowTimeMinutes(),
                          });
                        } else {
                          updateDraftSchedule({ type, intervalMinutes: 60 });
                        }
                      }}
                    >
                      <option value="once">{t("automations.scheduleTypes.once")}</option>
                      <option value="daily">{t("automations.scheduleTypes.daily")}</option>
                      <option value="weekly">{t("automations.scheduleTypes.weekly")}</option>
                      <option value="monthly">{t("automations.scheduleTypes.monthly")}</option>
                      <option value="interval">{t("automations.scheduleTypes.interval")}</option>
                    </select>
                  </label>

                  {draft.schedule.type === "once" && (
                    <label>
                      <span>{t("automations.fields.runAt")}</span>
                      <input
                        type="datetime-local"
                        value={formatInputDateTime(draft.schedule.runAtMs)}
                        onChange={(event) =>
                          updateDraftSchedule({
                            type: "once",
                            runAtMs: parseInputDateTime(event.target.value),
                          })
                        }
                      />
                    </label>
                  )}
                  {(draft.schedule.type === "daily" ||
                    draft.schedule.type === "weekly" ||
                    draft.schedule.type === "monthly") && (
                    <label>
                      <span>{t("automations.fields.time")}</span>
                      <input
                        type="time"
                        value={minutesToInput(draft.schedule.timeMinutes)}
                        onChange={(event) =>
                          updateDraftSchedule({
                            ...draft.schedule,
                            timeMinutes: inputToMinutes(event.target.value),
                          } as AutomationSchedule)
                        }
                      />
                    </label>
                  )}
                  {draft.schedule.type === "weekly" && (
                    <div className="automations-weekdays" aria-label={t("automations.fields.weekdays")}>
                      {weekdayValues.map((day) => (
                        <label key={day}>
                          <input
                            type="checkbox"
                            checked={draft.schedule.type === "weekly" && draft.schedule.daysOfWeek.includes(day)}
                            onChange={(event) => {
                              if (draft.schedule.type !== "weekly") {
                                return;
                              }
                              const nextDays = event.target.checked
                                ? [...draft.schedule.daysOfWeek, day]
                                : draft.schedule.daysOfWeek.filter((candidate) => candidate !== day);
                              updateDraftSchedule({
                                ...draft.schedule,
                                daysOfWeek: nextDays.length > 0 ? nextDays.sort() : [day],
                              });
                            }}
                          />
                          <span>{t(`automations.weekdays.${day}`)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {draft.schedule.type === "monthly" && (
                    <label>
                      <span>{t("automations.fields.dayOfMonth")}</span>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={draft.schedule.dayOfMonth}
                        onChange={(event) =>
                          updateDraftSchedule({
                            type: "monthly",
                            dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value) || 1)),
                            timeMinutes: (
                              draft.schedule as Extract<
                                AutomationSchedule,
                                { type: "monthly" }
                              >
                            ).timeMinutes,
                          })
                        }
                      />
                    </label>
                  )}
                  {draft.schedule.type === "interval" && (
                    <label>
                      <span>{t("automations.fields.intervalMinutes")}</span>
                      <input
                        type="number"
                        min={1}
                        value={draft.schedule.intervalMinutes}
                        onChange={(event) =>
                          updateDraftSchedule({
                            type: "interval",
                            intervalMinutes: Math.max(1, Number(event.target.value) || 1),
                          })
                        }
                      />
                    </label>
                  )}
                </div>

                <div className="automations-editor-grid">
                  <label>
                    <span>{t("automations.fields.threadPolicy")}</span>
                    <select
                      value={draft.threadPolicy.mode}
                      onChange={(event) =>
                        updateDraftThreadPolicy(
                          event.target.value === "continue"
                            ? { mode: "continue", threadId: "" }
                            : { mode: "new" },
                        )
                      }
                    >
                      <option value="new">{t("automations.threadPolicy.new")}</option>
                      <option value="continue">{t("automations.threadPolicy.continue")}</option>
                    </select>
                  </label>
                  {draft.threadPolicy.mode === "continue" && (
                    <label>
                      <span>{t("automations.fields.threadId")}</span>
                      <input
                        value={draft.threadPolicy.threadId}
                        onChange={(event) =>
                          updateDraftThreadPolicy({
                            mode: "continue",
                            threadId: event.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                </div>

                <div className="automations-editor-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setDraft(null)}
                  >
                    {t("automations.actions.cancel")}
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={!canSave || saving}
                  >
                    <Save size={14} aria-hidden />
                    <span>{saving ? t("automations.actions.saving") : t("automations.actions.save")}</span>
                  </button>
                </div>
              </form>
            )}

            <div className="automations-task-list">
              {loading ? (
                <div className="automations-empty">{t("automations.loading")}</div>
              ) : state.tasks.length === 0 ? (
                <div className="automations-empty">{t("automations.empty.tasks")}</div>
              ) : (
                state.tasks.map((task) => (
                  <article key={task.id} className="automations-task-row">
                    <div className="automations-task-main">
                      <div className="automations-task-title">{task.title}</div>
                      <div className="automations-task-meta">
                        <span>{taskWorkspaceName(task, workspaces)}</span>
                        <span>{scheduleLabel(task.schedule, t)}</span>
                        <span>{formatTime(task.nextRunAtMs, t("automations.notScheduled"))}</span>
                      </div>
                    </div>
                    <div className="automations-task-actions">
                      <button
                        type="button"
                        className={task.enabled ? "secondary" : "ghost"}
                        onClick={() => void handleToggleEnabled(task)}
                      >
                        {task.enabled
                          ? t("automations.actions.pause")
                          : t("automations.actions.resume")}
                      </button>
                      <button
                        type="button"
                        className="ghost automations-icon-button"
                        onClick={() => setDraft(task)}
                        aria-label={t("automations.actions.edit")}
                        title={t("automations.actions.edit")}
                      >
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="ghost automations-icon-button"
                        onClick={() => void handleDelete(task)}
                        aria-label={t("automations.actions.delete")}
                        title={t("automations.actions.delete")}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="automations-runs">
            {latestRuns.length === 0 ? (
              <div className="automations-empty">{t("automations.empty.runs")}</div>
            ) : (
              latestRuns.map((run) => (
                <article
                  key={run.id}
                  className={`automations-run-row status-${run.status}`}
                >
                  <div className="automations-run-icon">{runStatusIcon(run)}</div>
                  <div className="automations-run-main">
                    <div className="automations-run-title">{run.taskTitle}</div>
                    <div className="automations-run-meta">
                      <span>{t(`automations.runStatus.${run.status}`)}</span>
                      <span>{formatTime(run.scheduledForMs, "-")}</span>
                      {run.error && <span>{run.error}</span>}
                    </div>
                  </div>
                  {run.threadId && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onOpenThread(run.workspaceId, run.threadId!)}
                    >
                      {t("automations.actions.openThread")}
                    </button>
                  )}
                </article>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
