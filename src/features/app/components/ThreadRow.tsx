import type { CSSProperties, MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { ThreadSummary } from "../../../types";
import { getThreadStatusClass, type ThreadStatusById } from "../../../utils/threadStatus";

const SUBAGENT_ROLE_HUES: Record<string, number> = {
  default: 220,
  explorer: 205,
  reviewer: 142,
  planner: 34,
};

function formatSubagentRole(role: string | null | undefined) {
  const normalized = role?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

type ThreadRowProps = {
  thread: ThreadSummary;
  depth: number;
  workspaceId: string;
  indentUnit: number;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  pendingUserInputKeys?: Set<string>;
  workspaceLabel?: string | null;
  getThreadTime: (thread: ThreadSummary) => string | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
  ) => void;
  hasSubagentChildren?: boolean;
  subagentsExpanded?: boolean;
  onToggleSubagents?: (workspaceId: string, threadId: string) => void;
  showPinnedLabel?: boolean;
};

export function ThreadRow({
  thread,
  depth,
  workspaceId,
  indentUnit,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  pendingUserInputKeys,
  workspaceLabel,
  getThreadTime,
  getThreadArgsBadge,
  isThreadPinned,
  onSelectThread,
  onShowThreadMenu,
  hasSubagentChildren = false,
  subagentsExpanded = true,
  onToggleSubagents,
  showPinnedLabel = true,
}: ThreadRowProps) {
  const { t } = useTranslation("app");
  const relativeTime = getThreadTime(thread);
  const badge = getThreadArgsBadge?.(workspaceId, thread.id) ?? null;
  const modelBadge =
    thread.modelId && thread.modelId.trim().length > 0
      ? thread.effort && thread.effort.trim().length > 0
        ? `${thread.modelId} · ${thread.effort}`
        : thread.modelId
      : null;
  const indentStyle =
    depth > 0
      ? ({ "--thread-indent": `${depth * indentUnit}px` } as CSSProperties)
      : undefined;
  const hasPendingUserInput = Boolean(
    pendingUserInputKeys?.has(`${workspaceId}:${thread.id}`),
  );
  const statusClass = getThreadStatusClass(
    threadStatusById[thread.id],
    hasPendingUserInput,
  );
  const canPin = depth === 0;
  const isPinned = canPin && isThreadPinned(workspaceId, thread.id);
  const canToggleSubagents = hasSubagentChildren && Boolean(onToggleSubagents);
  const subagentNickname = thread.subagentNickname?.trim() ?? "";
  const subagentRoleKey = thread.subagentRole?.trim().toLowerCase() ?? "";
  const subagentRoleLabel = formatSubagentRole(thread.subagentRole);
  const subagentHue = SUBAGENT_ROLE_HUES[subagentRoleKey] ?? SUBAGENT_ROLE_HUES.default;
  const subagentPillStyle = {
    "--thread-subagent-pill-hue": `${subagentHue}`,
  } as CSSProperties;
  const showSubagentMeta = thread.isSubagent && (subagentNickname || subagentRoleLabel);

  return (
    <div
      className={`thread-row ${
        workspaceId === activeWorkspaceId && thread.id === activeThreadId
          ? "active"
          : ""
      }${canToggleSubagents ? " has-subagent-children" : ""}`}
      style={indentStyle}
      onClick={() => onSelectThread(workspaceId, thread.id)}
      onContextMenu={(event) => onShowThreadMenu(event, workspaceId, thread.id, canPin)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectThread(workspaceId, thread.id);
        }
      }}
    >
      <span className={`thread-status ${statusClass}`} aria-hidden />
      {isPinned && (
        <span
          className="thread-pin-icon"
          aria-label={showPinnedLabel ? t("sidebar.pinned") : undefined}
          aria-hidden={showPinnedLabel ? undefined : true}
        >
          📌
        </span>
      )}
      <span className="thread-name">{thread.name}</span>
      <div className="thread-meta">
        {showSubagentMeta ? (
          <>
            {subagentNickname ? (
              <span className="thread-subagent-pill" style={subagentPillStyle}>
                {subagentNickname}
              </span>
            ) : null}
            {subagentRoleLabel ? (
              <span className="thread-subagent-role">{subagentRoleLabel}</span>
            ) : null}
          </>
        ) : workspaceLabel ? (
          <span className="thread-workspace-label">{workspaceLabel}</span>
        ) : null}
        {modelBadge && (
          <span className="thread-model-badge" title={modelBadge}>
            {modelBadge}
          </span>
        )}
        {badge && <span className="thread-args-badge">{badge}</span>}
        {canToggleSubagents ? (
          <button
            type="button"
            className={`thread-subagent-time-toggle ${subagentsExpanded ? "expanded" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSubagents?.(workspaceId, thread.id);
            }}
            data-tauri-drag-region="false"
            aria-label={subagentsExpanded ? t("sidebar.hideSubagents") : t("sidebar.showSubagents")}
            aria-expanded={subagentsExpanded}
          >
            <span className="thread-subagent-time-label">{relativeTime ?? ""}</span>
            <span className="thread-subagent-toggle-icon" aria-hidden>
              ›
            </span>
          </button>
        ) : (
          relativeTime && <span className="thread-time">{relativeTime}</span>
        )}
        <div className="thread-menu">
          <div className="thread-menu-trigger" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
