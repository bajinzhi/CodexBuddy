import { useCallback, useEffect, useMemo, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import type { ThreadSummary, WorkspaceInfo } from "@/types";
import {
  deleteThread,
  listLoadedThreads,
  listThreads,
  listWorkspaces,
  unarchiveThread,
  unsubscribeThread,
} from "@services/tauri";
import { getThreadListNextCursor } from "@threads/utils/threadActionHelpers";
import { buildThreadSummaryFromThread } from "@threads/utils/threadSummary";

type ArchivedThreadEntry = {
  workspace: WorkspaceInfo;
  thread: ThreadSummary;
  hasReadableTitle: boolean;
};

type ArchivedThreadPage = {
  workspaceId: string;
  entries: ArchivedThreadEntry[];
  nextCursor: string | null;
  error: string | null;
};

type LoadedThreadEntry = {
  workspace: WorkspaceInfo;
  threadId: string;
  status: string | null;
};

function readResultObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const result = record.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return record;
}

function readDataArray(value: unknown): unknown[] {
  const result = readResultObject(value);
  return Array.isArray(result.data) ? result.data : [];
}

function readThreadRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readLoadedThreadId(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const raw = record.threadId ?? record.thread_id ?? record.id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readLoadedThreadStatus(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (typeof status === "string") {
    return status;
  }
  if (status && typeof status === "object" && !Array.isArray(status)) {
    const type = (status as Record<string, unknown>).type;
    return typeof type === "string" ? type : null;
  }
  return null;
}

function formatThreadTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  const millis = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(millis).toLocaleString();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getWorkspaceErrorMessage(workspace: WorkspaceInfo, error: unknown) {
  return `${workspace.name}: ${getErrorMessage(error)}`;
}

function getThreadSortTimestamp(thread: ThreadSummary) {
  return thread.recencyAt ?? thread.updatedAt ?? 0;
}

function getShortThreadId(threadId: string) {
  return threadId.slice(0, 8);
}

function getCompactThreadId(threadId: string) {
  if (threadId.length <= 18) {
    return threadId;
  }
  return `${threadId.slice(0, 8)}...${threadId.slice(-5)}`;
}

function isThreadIdTitle(title: string, threadId: string) {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedThreadId = threadId.trim().toLowerCase();
  return normalizedTitle === normalizedThreadId || normalizedTitle.includes(normalizedThreadId);
}

function getArchivedThreadTitle(
  thread: ThreadSummary,
  hasReadableTitle: boolean,
  untitledLabel: string,
) {
  const title = thread.name.trim();
  if (!hasReadableTitle || !title || isThreadIdTitle(title, thread.id)) {
    return `${untitledLabel} · ${getShortThreadId(thread.id)}`;
  }
  return title;
}

function getWorkspaceContextLabel(workspace: WorkspaceInfo) {
  const path = workspace.path.trim();
  return path ? `${workspace.name} · ${path}` : workspace.name;
}

function getModelContextLabel(thread: ThreadSummary) {
  const modelId = thread.modelId?.trim();
  const effort = thread.effort?.trim();
  if (modelId && effort) {
    return `${modelId} · ${effort}`;
  }
  return modelId || effort || null;
}

function getSubagentContextLabel(thread: ThreadSummary) {
  if (!thread.isSubagent) {
    return null;
  }
  const nickname = thread.subagentNickname?.trim();
  const role = thread.subagentRole?.trim();
  if (nickname && role) {
    return `${nickname} · ${role}`;
  }
  return nickname || role || null;
}

function sortArchivedEntries(entries: ArchivedThreadEntry[]) {
  return [...entries].sort(
    (a, b) => getThreadSortTimestamp(b.thread) - getThreadSortTimestamp(a.thread),
  );
}

function mergeArchivedEntries(
  current: ArchivedThreadEntry[],
  next: ArchivedThreadEntry[],
) {
  const byKey = new Map<string, ArchivedThreadEntry>();
  current.forEach((entry) => {
    byKey.set(`${entry.workspace.id}:${entry.thread.id}`, entry);
  });
  next.forEach((entry) => {
    byKey.set(`${entry.workspace.id}:${entry.thread.id}`, entry);
  });
  return sortArchivedEntries([...byKey.values()]);
}

function readArchivedThreadPage(
  workspace: WorkspaceInfo,
  response: unknown,
): Pick<ArchivedThreadPage, "entries" | "nextCursor"> {
  const result = readResultObject(response);
  return {
    entries: readDataArray(response)
      .map(readThreadRecord)
      .filter((thread): thread is Record<string, unknown> =>
        Boolean(thread),
      )
      .map((thread, index) => {
        const threadId = typeof thread.id === "string" ? thread.id : "";
        const preview = typeof thread.preview === "string" ? thread.preview.trim() : "";
        const hasReadableTitle = Boolean(
          preview && (!threadId || !isThreadIdTitle(preview, threadId)),
        );
        const summary = buildThreadSummaryFromThread({
          workspaceId: workspace.id,
          thread,
          fallbackIndex: index,
        });
        return summary ? { workspace, thread: summary, hasReadableTitle } : null;
      })
      .filter((entry): entry is ArchivedThreadEntry => Boolean(entry)),
    nextCursor: getThreadListNextCursor(result),
  };
}

export function ArchivedThreadsSection() {
  const { t } = useTranslation(["settings", "common"]);
  const [entries, setEntries] = useState<ArchivedThreadEntry[]>([]);
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [nextCursorByWorkspace, setNextCursorByWorkspace] = useState<
    Record<string, string | null>
  >({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const hasMoreArchivedThreads = useMemo(
    () => Object.values(nextCursorByWorkspace).some((cursor) => Boolean(cursor)),
    [nextCursorByWorkspace],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const workspaces = await listWorkspaces();
      const connectedWorkspaces = workspaces.filter((workspace) => workspace.connected);
      setArchivedWorkspaces(connectedWorkspaces);
      const pages = await Promise.all(
        connectedWorkspaces.map(async (workspace) => {
          try {
            const response = await listThreads(
              workspace.id,
              null,
              50,
              "recency_at",
              null,
              true,
            );
            const page = readArchivedThreadPage(workspace, response);
            return {
              workspaceId: workspace.id,
              entries: page.entries,
              nextCursor: page.nextCursor,
              error: null,
            };
          } catch (workspaceError) {
            return {
              workspaceId: workspace.id,
              entries: [] as ArchivedThreadEntry[],
              nextCursor: null,
              error: getWorkspaceErrorMessage(workspace, workspaceError),
            };
          }
        }),
      );
      const errors = pages
        .map((page) => page.error)
        .filter((message): message is string => Boolean(message));
      setError(errors.length > 0 ? errors.join("\n") : null);
      setNextCursorByWorkspace(
        pages.reduce<Record<string, string | null>>((acc, page) => {
          acc[page.workspaceId] = page.nextCursor;
          return acc;
        }, {}),
      );
      setEntries(sortArchivedEntries(pages.flatMap((page) => page.entries)));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleLoadMore = useCallback(async () => {
    const cursors = nextCursorByWorkspace;
    const workspaceIdsWithCursor = new Set(
      Object.entries(cursors)
        .filter(([, cursor]) => Boolean(cursor))
        .map(([workspaceId]) => workspaceId),
    );
    if (workspaceIdsWithCursor.size === 0) {
      return;
    }
    setLoadingMore(true);
    setError(null);
    try {
      const pages = await Promise.all(
        archivedWorkspaces
          .filter(
            (workspace) =>
              workspace.connected && workspaceIdsWithCursor.has(workspace.id),
          )
          .map(async (workspace): Promise<ArchivedThreadPage> => {
            const cursor = cursors[workspace.id] ?? null;
            if (!cursor) {
              return {
                workspaceId: workspace.id,
                entries: [],
                nextCursor: null,
                error: null,
              };
            }
            try {
              const response = await listThreads(
                workspace.id,
                cursor,
                50,
                "recency_at",
                null,
                true,
              );
              const page = readArchivedThreadPage(workspace, response);
              return {
                workspaceId: workspace.id,
                entries: page.entries,
                nextCursor: page.nextCursor,
                error: null,
              };
            } catch (workspaceError) {
              return {
                workspaceId: workspace.id,
                entries: [],
                nextCursor: cursor,
                error: getWorkspaceErrorMessage(workspace, workspaceError),
              };
            }
          }),
      );
      const errors = pages
        .map((page) => page.error)
        .filter((message): message is string => Boolean(message));
      setError(errors.length > 0 ? errors.join("\n") : null);
      setNextCursorByWorkspace((current) => {
        const next = { ...current };
        pages.forEach((page) => {
          next[page.workspaceId] = page.nextCursor;
        });
        return next;
      });
      setEntries((current) =>
        mergeArchivedEntries(current, pages.flatMap((page) => page.entries)),
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoadingMore(false);
    }
  }, [archivedWorkspaces, nextCursorByWorkspace]);

  const handleUnarchive = useCallback(
    async (entry: ArchivedThreadEntry) => {
      const key = `${entry.workspace.id}:${entry.thread.id}`;
      setBusyKey(key);
      setError(null);
      try {
        await unarchiveThread(entry.workspace.id, entry.thread.id);
        setEntries((current) =>
          current.filter(
            (candidate) =>
              candidate.workspace.id !== entry.workspace.id ||
              candidate.thread.id !== entry.thread.id,
            ),
        );
      } catch (unarchiveError) {
        setError(getErrorMessage(unarchiveError));
      } finally {
        setBusyKey(null);
      }
    },
    [],
  );

  const handleDelete = useCallback(
    async (entry: ArchivedThreadEntry) => {
      const confirmed = await ask(
        t("codex.archived.deleteConfirmMessage"),
        {
          title: t("codex.archived.deleteConfirmTitle"),
          kind: "warning",
          okLabel: t("common:actions.delete"),
          cancelLabel: t("common:actions.cancel"),
        },
      );
      if (!confirmed) {
        return;
      }
      const key = `${entry.workspace.id}:${entry.thread.id}`;
      setBusyKey(key);
      setError(null);
      try {
        await deleteThread(entry.workspace.id, entry.thread.id);
        setEntries((current) =>
          current.filter(
            (candidate) =>
              candidate.workspace.id !== entry.workspace.id ||
              candidate.thread.id !== entry.thread.id,
            ),
        );
      } catch (deleteError) {
        setError(getErrorMessage(deleteError));
      } finally {
        setBusyKey(null);
      }
    },
    [t],
  );

  return (
    <div className="settings-field codex-thread-section">
      <div className="settings-field-label settings-field-label--section">
        {t("codex.archived.title")}
      </div>
      <div className="settings-help">{t("codex.archived.subtitle")}</div>
      <div className="settings-field-actions">
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? t("common:status.loading") : t("common:actions.refresh")}
        </button>
        {hasMoreArchivedThreads ? (
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void handleLoadMore()}
            disabled={loading || loadingMore}
          >
            {loadingMore ? t("common:status.loading") : t("codex.archived.loadMore")}
          </button>
        ) : null}
      </div>
      {error ? <div className="settings-group-error">{error}</div> : null}
      <div className="settings-thread-list">
        {!loading && entries.length === 0 ? (
          <div className="settings-empty-state">{t("codex.archived.empty")}</div>
        ) : null}
        {entries.map((entry) => {
          const key = `${entry.workspace.id}:${entry.thread.id}`;
          const title = getArchivedThreadTitle(
            entry.thread,
            entry.hasReadableTitle,
            t("codex.archived.untitledThread"),
          );
          const workspaceContext = getWorkspaceContextLabel(entry.workspace);
          const activeTime = formatThreadTime(
            entry.thread.recencyAt ?? entry.thread.updatedAt,
          );
          const createdTime = entry.thread.createdAt
            ? formatThreadTime(entry.thread.createdAt)
            : null;
          const detailItems = [
            activeTime ? `${t("codex.archived.lastActiveLabel")}: ${activeTime}` : null,
            createdTime ? `${t("codex.archived.createdLabel")}: ${createdTime}` : null,
            getModelContextLabel(entry.thread),
            getSubagentContextLabel(entry.thread),
          ].filter((item): item is string => Boolean(item));
          return (
            <div className="settings-thread-row" key={key}>
              <div className="settings-thread-main">
                <div
                  className="settings-thread-title"
                  title={entry.hasReadableTitle ? entry.thread.name : entry.thread.id}
                >
                  {title}
                </div>
                <div className="settings-thread-meta" title={entry.workspace.path}>
                  {workspaceContext}
                </div>
                {detailItems.length > 0 ? (
                  <div className="settings-thread-detail">
                    {detailItems.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
                <div className="settings-thread-id" title={entry.thread.id}>
                  {t("codex.archived.idLabel")}: {getCompactThreadId(entry.thread.id)}
                </div>
              </div>
              <div className="settings-thread-actions">
                <button
                  type="button"
                  className="ghost settings-button-compact"
                  onClick={() => void handleUnarchive(entry)}
                  disabled={busyKey === key}
                >
                  {t("codex.archived.unarchive")}
                </button>
                <button
                  type="button"
                  className="ghost settings-button-compact"
                  onClick={() => void navigator.clipboard.writeText(entry.thread.id)}
                >
                  {t("common:actions.copy")}
                </button>
                <button
                  type="button"
                  className="ghost settings-button-compact danger"
                  onClick={() => void handleDelete(entry)}
                  disabled={busyKey === key}
                >
                  {t("common:actions.delete")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LoadedThreadsSection() {
  const { t } = useTranslation(["settings", "common"]);
  const [entries, setEntries] = useState<LoadedThreadEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const workspaces = await listWorkspaces();
      const connectedWorkspaces = workspaces.filter((workspace) => workspace.connected);
      const pages = await Promise.all(
        connectedWorkspaces.map(async (workspace) => {
          try {
            const response = await listLoadedThreads(workspace.id, null, 100);
            return {
              entries: readDataArray(response)
                .map((item) => {
                  const threadId = readLoadedThreadId(item);
                  return threadId
                    ? {
                        workspace,
                        threadId,
                        status: readLoadedThreadStatus(item),
                      }
                    : null;
                })
                .filter((entry): entry is LoadedThreadEntry => Boolean(entry)),
              error: null,
            };
          } catch (workspaceError) {
            return {
              entries: [] as LoadedThreadEntry[],
              error: getWorkspaceErrorMessage(workspace, workspaceError),
            };
          }
        }),
      );
      const errors = pages
        .map((page) => page.error)
        .filter((message): message is string => Boolean(message));
      setError(errors.length > 0 ? errors.join("\n") : null);
      setEntries(pages.flatMap((page) => page.entries));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const workspaceNamesById = useMemo(
    () =>
      entries.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.workspace.id] = entry.workspace.name;
        return acc;
      }, {}),
    [entries],
  );

  const handleRelease = useCallback(async (entry: LoadedThreadEntry) => {
    const key = `${entry.workspace.id}:${entry.threadId}`;
    setBusyKey(key);
    setError(null);
    try {
      const response = await unsubscribeThread(entry.workspace.id, entry.threadId);
      const status = readResultObject(response).status;
      const normalizedStatus = typeof status === "string" ? status : null;
      if (normalizedStatus === "notLoaded" || normalizedStatus === "unsubscribed") {
        setEntries((current) =>
          current.filter(
            (candidate) =>
              candidate.workspace.id !== entry.workspace.id ||
              candidate.threadId !== entry.threadId,
          ),
        );
      } else {
        setEntries((current) =>
          current.map((candidate) =>
            candidate.workspace.id === entry.workspace.id &&
            candidate.threadId === entry.threadId
              ? { ...candidate, status: normalizedStatus ?? candidate.status }
              : candidate,
          ),
        );
      }
    } catch (releaseError) {
      setError(getErrorMessage(releaseError));
    } finally {
      setBusyKey(null);
    }
  }, []);

  return (
    <div className="settings-field codex-thread-section">
      <div className="settings-field-label settings-field-label--section">
        {t("codex.loaded.title")}
      </div>
      <div className="settings-help">{t("codex.loaded.subtitle")}</div>
      <div className="settings-field-actions">
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? t("common:status.loading") : t("common:actions.refresh")}
        </button>
      </div>
      {error ? <div className="settings-group-error">{error}</div> : null}
      <div className="settings-thread-list">
        {!loading && entries.length === 0 ? (
          <div className="settings-empty-state">{t("codex.loaded.empty")}</div>
        ) : null}
        {entries.map((entry) => {
          const key = `${entry.workspace.id}:${entry.threadId}`;
          return (
            <div className="settings-thread-row" key={key}>
              <div className="settings-thread-main">
                <div className="settings-thread-title">{entry.threadId}</div>
                <div className="settings-thread-meta">
                  {workspaceNamesById[entry.workspace.id] ?? entry.workspace.name}
                  {entry.status ? ` · ${entry.status}` : ""}
                </div>
              </div>
              <div className="settings-thread-actions">
                <button
                  type="button"
                  className="ghost settings-button-compact"
                  onClick={() => void handleRelease(entry)}
                  disabled={busyKey === key}
                >
                  {t("codex.loaded.release")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
