import { useCallback, useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  cleanThreadBackgroundTerminals,
  listThreadBackgroundTerminals,
  terminateThreadBackgroundTerminal,
} from "@services/tauri";

type BackgroundTerminal = {
  itemId: string;
  processId: string;
  command: string;
  cwd: string;
  osPid: number | null;
  cpuPercent: number | null;
  rssKb: number | null;
};

type BackgroundTerminalsPanelProps = {
  workspaceId: string;
  threadId: string;
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

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTerminal(value: unknown): BackgroundTerminal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const processId = String(record.processId ?? record.process_id ?? "").trim();
  if (!processId) {
    return null;
  }
  return {
    itemId: String(record.itemId ?? record.item_id ?? ""),
    processId,
    command: String(record.command ?? ""),
    cwd: String(record.cwd ?? ""),
    osPid: readNumber(record.osPid ?? record.os_pid),
    cpuPercent: readNumber(record.cpuPercent ?? record.cpu_percent),
    rssKb: readNumber(record.rssKb ?? record.rss_kb),
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function BackgroundTerminalsPanel({
  workspaceId,
  threadId,
}: BackgroundTerminalsPanelProps) {
  const { t } = useTranslation(["app", "common"]);
  const [terminals, setTerminals] = useState<BackgroundTerminal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyProcessId, setBusyProcessId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listThreadBackgroundTerminals(
        workspaceId,
        threadId,
        null,
        50,
      );
      const result = readResultObject(response);
      const data = Array.isArray(result.data) ? result.data : [];
      setTerminals(
        data
          .map(readTerminal)
          .filter((terminal): terminal is BackgroundTerminal => Boolean(terminal)),
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [threadId, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleTerminate = useCallback(
    async (terminal: BackgroundTerminal) => {
      const confirmed = await ask(t("terminal.background.terminateConfirm"), {
        title: t("terminal.background.terminateTitle"),
        kind: "warning",
        okLabel: t("common:actions.stop"),
        cancelLabel: t("common:actions.cancel"),
      });
      if (!confirmed) {
        return;
      }
      setBusyProcessId(terminal.processId);
      setError(null);
      try {
        await terminateThreadBackgroundTerminal(
          workspaceId,
          threadId,
          terminal.processId,
        );
        await refresh();
      } catch (terminateError) {
        setError(getErrorMessage(terminateError));
      } finally {
        setBusyProcessId(null);
      }
    },
    [refresh, t, threadId, workspaceId],
  );

  const handleClean = useCallback(async () => {
    const confirmed = await ask(t("terminal.background.cleanConfirm"), {
      title: t("terminal.background.cleanTitle"),
      kind: "warning",
      okLabel: t("common:actions.stop"),
      cancelLabel: t("common:actions.cancel"),
    });
    if (!confirmed) {
      return;
    }
    setBusyProcessId("__clean__");
    setError(null);
    try {
      await cleanThreadBackgroundTerminals(workspaceId, threadId);
      await refresh();
    } catch (cleanError) {
      setError(getErrorMessage(cleanError));
    } finally {
      setBusyProcessId(null);
    }
  }, [refresh, t, threadId, workspaceId]);

  return (
    <div className="background-terminals-panel">
      <div className="background-terminals-toolbar">
        <div className="background-terminals-title">
          {t("terminal.background.title")}
        </div>
        <button
          type="button"
          className="ghost terminal-action-button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? t("common:status.loading") : t("common:actions.refresh")}
        </button>
        <button
          type="button"
          className="ghost terminal-action-button"
          onClick={() => void handleClean()}
          disabled={terminals.length === 0 || busyProcessId !== null}
        >
          {t("terminal.background.clean")}
        </button>
      </div>
      {error ? (
        <div className="background-terminals-error">
          {t("terminal.background.unsupported", { error })}
        </div>
      ) : null}
      {!loading && !error && terminals.length === 0 ? (
        <div className="background-terminals-empty">
          {t("terminal.background.empty")}
        </div>
      ) : null}
      {terminals.map((terminal) => (
        <div className="background-terminal-row" key={terminal.processId}>
          <div className="background-terminal-main">
            <div className="background-terminal-command">
              {terminal.command || terminal.processId}
            </div>
            <div className="background-terminal-meta">
              {terminal.cwd}
              {terminal.osPid ? ` · pid ${terminal.osPid}` : ""}
              {terminal.cpuPercent !== null ? ` · ${terminal.cpuPercent.toFixed(1)}% CPU` : ""}
              {terminal.rssKb !== null ? ` · ${Math.round(terminal.rssKb / 1024)} MB` : ""}
            </div>
          </div>
          <button
            type="button"
            className="ghost terminal-action-button danger"
            onClick={() => void handleTerminate(terminal)}
            disabled={busyProcessId === terminal.processId}
          >
            {t("common:actions.stop")}
          </button>
        </div>
      ))}
    </div>
  );
}
