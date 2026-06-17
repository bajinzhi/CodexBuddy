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
import { buildThreadSummaryFromThread } from "@threads/utils/threadSummary";

type ArchivedThreadEntry = {
  workspace: WorkspaceInfo;
  thread: ThreadSummary;
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

export function ArchivedThreadsSection() {
  const { t } = useTranslation(["settings", "common"]);
  const [entries, setEntries] = useState<ArchivedThreadEntry[]>([]);
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
            const response = await listThreads(
              workspace.id,
              null,
              50,
              "recency_at",
              null,
              true,
            );
            return {
              entries: readDataArray(response)
                .map(readThreadRecord)
                .filter((thread): thread is Record<string, unknown> =>
                  Boolean(thread),
                )
                .map((thread, index) => {
                  const summary = buildThreadSummaryFromThread({
                    workspaceId: workspace.id,
                    thread,
                    fallbackIndex: index,
                  });
                  return summary ? { workspace, thread: summary } : null;
                })
                .filter((entry): entry is ArchivedThreadEntry => Boolean(entry)),
              error: null,
            };
          } catch (workspaceError) {
            return {
              entries: [] as ArchivedThreadEntry[],
              error: getWorkspaceErrorMessage(workspace, workspaceError),
            };
          }
        }),
      );
      const errors = pages
        .map((page) => page.error)
        .filter((message): message is string => Boolean(message));
      setError(errors.length > 0 ? errors.join("\n") : null);
      setEntries(
        pages
          .flatMap((page) => page.entries)
          .sort((a, b) => (b.thread.recencyAt ?? b.thread.updatedAt) - (a.thread.recencyAt ?? a.thread.updatedAt)),
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      </div>
      {error ? <div className="settings-group-error">{error}</div> : null}
      <div className="settings-thread-list">
        {!loading && entries.length === 0 ? (
          <div className="settings-empty-state">{t("codex.archived.empty")}</div>
        ) : null}
        {entries.map((entry) => {
          const key = `${entry.workspace.id}:${entry.thread.id}`;
          const time = formatThreadTime(entry.thread.recencyAt ?? entry.thread.updatedAt);
          return (
            <div className="settings-thread-row" key={key}>
              <div className="settings-thread-main">
                <div className="settings-thread-title">{entry.thread.name}</div>
                <div className="settings-thread-meta">
                  {entry.workspace.name}
                  {time ? ` · ${time}` : ""}
                </div>
                <div className="settings-thread-id">{entry.thread.id}</div>
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
