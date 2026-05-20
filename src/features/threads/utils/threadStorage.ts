import type { AccessMode, ServiceTier } from "@/types";

const STORAGE_KEY_THREAD_ACTIVITY = "codexbuddy.threadLastUserActivity";
export const STORAGE_KEY_PINNED_THREADS = "codexbuddy.pinnedThreads";
export const STORAGE_KEY_CUSTOM_NAMES = "codexbuddy.threadCustomNames";
export const STORAGE_KEY_THREAD_CODEX_PARAMS = "codexbuddy.threadCodexParams";
export const STORAGE_KEY_THREAD_GOALS = "codexbuddy.threadGoals";
export const THREAD_GOALS_CHANGED_EVENT = "codexbuddy:threadGoalsChanged";
export const STORAGE_KEY_DETACHED_REVIEW_LINKS = "codexbuddy.detachedReviewLinks";
export const MAX_PINS_SOFT_LIMIT = 5;

export type ThreadActivityMap = Record<string, Record<string, number>>;
export type PinnedThreadsMap = Record<string, number>;
export type CustomNamesMap = Record<string, string>;
type DetachedReviewLinksMap = Record<string, Record<string, string>>;

// Per-thread Codex parameter overrides. Keyed by `${workspaceId}:${threadId}`.
// These are UI-level preferences (not server state) and are best-effort persisted.
export type ThreadCodexParams = {
  modelId: string | null;
  effort: string | null;
  // string => explicit per-thread tier override
  // null => explicit "Default/off" override
  // undefined => legacy/unset thread value that should inherit no-thread scope
  serviceTier: ServiceTier | null | undefined;
  accessMode: AccessMode | null;
  collaborationModeId: string | null;
  // string => explicit per-thread override
  // null => explicit "Default" (no override)
  // undefined => legacy/unset thread value that should inherit no-thread scope
  codexArgsOverride: string | null | undefined;
  updatedAt: number;
};

export type ThreadCodexParamsMap = Record<string, ThreadCodexParams>;

export type ThreadGoalStatus =
  | "active"
  | "paused"
  | "blocked"
  | "usageLimited"
  | "budgetLimited"
  | "complete";

export type ThreadGoal = {
  threadId?: string;
  objective: string;
  status: ThreadGoalStatus;
  tokenBudget?: number | null;
  tokensUsed?: number;
  timeUsedSeconds?: number;
  backendSynced?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ThreadGoalsMap = Record<string, ThreadGoal>;

export function makeThreadCodexParamsKey(workspaceId: string, threadId: string): string {
  return `${workspaceId}:${threadId}`;
}

export function loadThreadCodexParams(): ThreadCodexParamsMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_THREAD_CODEX_PARAMS);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ThreadCodexParamsMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveThreadCodexParams(next: ThreadCodexParamsMap): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_THREAD_CODEX_PARAMS,
      JSON.stringify(next),
    );
  } catch {
    // Best-effort persistence.
  }
}

const THREAD_GOAL_STATUSES = new Set<ThreadGoalStatus>([
  "active",
  "paused",
  "blocked",
  "usageLimited",
  "budgetLimited",
  "complete",
]);

function isThreadGoalStatus(value: unknown): value is ThreadGoalStatus {
  return typeof value === "string" && THREAD_GOAL_STATUSES.has(value as ThreadGoalStatus);
}

function normalizeThreadGoalStatus(value: unknown): ThreadGoalStatus {
  if (isThreadGoalStatus(value)) {
    return value;
  }
  if (value === "usage_limited") {
    return "usageLimited";
  }
  if (value === "budget_limited") {
    return "budgetLimited";
  }
  return "active";
}

function timestampFromUnknown(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeThreadGoal(
  value: unknown,
  options: {
    threadId?: string;
    backendSynced?: boolean;
  } = {},
): ThreadGoal | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const objective = typeof entry.objective === "string" ? entry.objective.trim() : "";
  if (!objective) {
    return null;
  }
  const now = Date.now();
  const status = normalizeThreadGoalStatus(entry.status);
  const tokenBudget =
    (entry.tokenBudget ?? entry.token_budget) === null
      ? null
      : optionalFiniteNumber(entry.tokenBudget ?? entry.token_budget);
  return {
    threadId:
      typeof entry.threadId === "string"
        ? entry.threadId
        : typeof entry.thread_id === "string"
          ? entry.thread_id
          : options.threadId,
    objective,
    status,
    tokenBudget,
    tokensUsed: optionalFiniteNumber(entry.tokensUsed ?? entry.tokens_used),
    timeUsedSeconds: optionalFiniteNumber(entry.timeUsedSeconds ?? entry.time_used_seconds),
    backendSynced: options.backendSynced ?? Boolean(entry.backendSynced),
    createdAt: timestampFromUnknown(entry.createdAt ?? entry.created_at, now),
    updatedAt: timestampFromUnknown(entry.updatedAt ?? entry.updated_at, now),
  };
}

function emitThreadGoalsChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(THREAD_GOALS_CHANGED_EVENT));
  } catch {
    // Best-effort same-window notification.
  }
}

export function loadThreadGoals(): ThreadGoalsMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_THREAD_GOALS);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) => {
        const goal = normalizeThreadGoal(value);
        return goal ? [[key, goal]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export function saveThreadGoals(next: ThreadGoalsMap): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY_THREAD_GOALS, JSON.stringify(next));
  } catch {
    // Best-effort persistence.
  }
  emitThreadGoalsChanged();
}

export function getThreadGoal(
  workspaceId: string,
  threadId: string,
): ThreadGoal | null {
  const key = makeThreadCodexParamsKey(workspaceId, threadId);
  return loadThreadGoals()[key] ?? null;
}

export function setThreadGoal(
  workspaceId: string,
  threadId: string,
  objective: string,
  options: Partial<Omit<ThreadGoal, "objective">> = {},
): ThreadGoal {
  const goals = loadThreadGoals();
  const key = makeThreadCodexParamsKey(workspaceId, threadId);
  const now = Date.now();
  const current = goals[key] ?? null;
  const goal: ThreadGoal = {
    threadId: options.threadId ?? current?.threadId,
    objective: objective.trim(),
    status: options.status ?? "active",
    tokenBudget: options.tokenBudget,
    tokensUsed: options.tokensUsed,
    timeUsedSeconds: options.timeUsedSeconds,
    backendSynced: options.backendSynced ?? false,
    createdAt: options.createdAt ?? current?.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
  };
  saveThreadGoals({ ...goals, [key]: goal });
  return goal;
}

export function storeThreadGoal(
  workspaceId: string,
  threadId: string,
  goal: ThreadGoal,
): ThreadGoal {
  const goals = loadThreadGoals();
  const key = makeThreadCodexParamsKey(workspaceId, threadId);
  saveThreadGoals({ ...goals, [key]: goal });
  return goal;
}

export function storeThreadGoalFromRaw(
  workspaceId: string,
  threadId: string,
  value: unknown,
  options: { backendSynced?: boolean } = {},
): ThreadGoal | null {
  const goal = normalizeThreadGoal(value, {
    threadId,
    backendSynced: options.backendSynced,
  });
  if (!goal) {
    return null;
  }
  return storeThreadGoal(workspaceId, threadId, goal);
}

export function updateThreadGoalStatus(
  workspaceId: string,
  threadId: string,
  status: ThreadGoalStatus,
  options: Pick<Partial<ThreadGoal>, "backendSynced" | "updatedAt"> = {},
): ThreadGoal | null {
  const goals = loadThreadGoals();
  const key = makeThreadCodexParamsKey(workspaceId, threadId);
  const current = goals[key] ?? null;
  if (!current) {
    return null;
  }
  const goal: ThreadGoal = {
    ...current,
    status,
    backendSynced: options.backendSynced ?? current.backendSynced,
    updatedAt: options.updatedAt ?? Date.now(),
  };
  saveThreadGoals({ ...goals, [key]: goal });
  return goal;
}

export function clearThreadGoal(workspaceId: string, threadId: string): boolean {
  const goals = loadThreadGoals();
  const key = makeThreadCodexParamsKey(workspaceId, threadId);
  if (!(key in goals)) {
    return false;
  }
  const { [key]: _removed, ...rest } = goals;
  saveThreadGoals(rest);
  return true;
}

export function loadThreadActivity(): ThreadActivityMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_THREAD_ACTIVITY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ThreadActivityMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveThreadActivity(activity: ThreadActivityMap) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_THREAD_ACTIVITY,
      JSON.stringify(activity),
    );
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

export function makeCustomNameKey(workspaceId: string, threadId: string): string {
  return `${workspaceId}:${threadId}`;
}

export function loadCustomNames(): CustomNamesMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CUSTOM_NAMES);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as CustomNamesMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveCustomName(workspaceId: string, threadId: string, name: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const current = loadCustomNames();
    const key = makeCustomNameKey(workspaceId, threadId);
    current[key] = name;
    window.localStorage.setItem(
      STORAGE_KEY_CUSTOM_NAMES,
      JSON.stringify(current),
    );
  } catch {
    // Best-effort persistence.
  }
}

export function makePinKey(workspaceId: string, threadId: string): string {
  return `${workspaceId}:${threadId}`;
}

export function loadPinnedThreads(): PinnedThreadsMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PINNED_THREADS);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as PinnedThreadsMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function savePinnedThreads(pinned: PinnedThreadsMap) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_PINNED_THREADS,
      JSON.stringify(pinned),
    );
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

export function loadDetachedReviewLinks(): DetachedReviewLinksMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_DETACHED_REVIEW_LINKS);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as DetachedReviewLinksMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveDetachedReviewLinks(links: DetachedReviewLinksMap) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_DETACHED_REVIEW_LINKS,
      JSON.stringify(links),
    );
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}
