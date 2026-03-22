import type { GitHubIssue, GitHubPullRequest, GitLogEntry } from "../../../types";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import ArrowLeftRight from "lucide-react/dist/esm/icons/arrow-left-right";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import Download from "lucide-react/dist/esm/icons/download";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import RotateCw from "lucide-react/dist/esm/icons/rotate-cw";
import Upload from "lucide-react/dist/esm/icons/upload";
import { formatRelativeTime } from "../../../utils/time";
import {
  MagicSparkleIcon,
  MagicSparkleLoaderIcon,
} from "@/features/shared/components/MagicSparkleIcon";
import type { GitPanelMode } from "../types";
import type { PerFileDiffGroup } from "../utils/perFileThreadDiffs";
import {
  CommitButton,
  DiffSection,
  type DiffFile,
  GitLogEntryRow,
} from "./GitDiffPanelShared";
import {
  DEPTH_OPTIONS,
  isGitRootNotFound,
  isMissingRepo,
  normalizeRootPath,
  splitPath,
} from "./GitDiffPanel.utils";

type GitMode = GitPanelMode;

type GitPanelModeStatusProps = {
  mode: GitMode;
  diffStatusLabel: string;
  perFileDiffStatusLabel: string;
  logCountLabel: string;
  logSyncLabel: string;
  logUpstreamLabel: string;
  issuesLoading: boolean;
  issuesTotal: number;
  pullRequestsLoading: boolean;
  pullRequestsTotal: number;
};

export function GitPanelModeStatus({
  mode,
  diffStatusLabel,
  perFileDiffStatusLabel,
  logCountLabel,
  logSyncLabel,
  logUpstreamLabel,
  issuesLoading,
  issuesTotal,
  pullRequestsLoading,
  pullRequestsTotal,
}: GitPanelModeStatusProps) {
  const { t } = useTranslation("git");
  if (mode === "diff") {
    return <div className="diff-status">{diffStatusLabel}</div>;
  }

  if (mode === "perFile") {
    return <div className="diff-status">{perFileDiffStatusLabel}</div>;
  }

  if (mode === "log") {
    return (
      <>
        <div className="diff-status">{logCountLabel}</div>
        <div className="git-log-sync">
          <span>{logSyncLabel}</span>
          {logUpstreamLabel && (
            <>
              <span className="git-log-sep">·</span>
              <span>{logUpstreamLabel}</span>
            </>
          )}
        </div>
      </>
    );
  }

  if (mode === "issues") {
    return (
      <>
        <div className="diff-status diff-status-issues">
          <span>{t("githubIssues")}</span>
          {issuesLoading && <span className="git-panel-spinner" aria-hidden />}
        </div>
        <div className="git-log-sync">
          <span>{t("openCount", { count: issuesTotal })}</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="diff-status diff-status-issues">
        <span>{t("githubPullRequests")}</span>
        {pullRequestsLoading && <span className="git-panel-spinner" aria-hidden />}
      </div>
      <div className="git-log-sync">
        <span>{t("openCount", { count: pullRequestsTotal })}</span>
      </div>
    </>
  );
}

type GitBranchRowProps = {
  mode: GitMode;
  branchName: string;
  onFetch?: () => void | Promise<void>;
  fetchLoading: boolean;
};

export function GitBranchRow({ mode, branchName, onFetch, fetchLoading }: GitBranchRowProps) {
  const { t } = useTranslation("git");
  if (mode !== "diff" && mode !== "perFile" && mode !== "log") {
    return null;
  }

  return (
    <div className="diff-branch-row">
      <div className="diff-branch">{branchName || t("common:labels.unknown")}</div>
      <button
        type="button"
        className="diff-branch-refresh"
        onClick={() => void onFetch?.()}
        disabled={!onFetch || fetchLoading}
        title={fetchLoading ? t("fetchingRemote") : t("fetchRemote")}
        aria-label={fetchLoading ? t("fetchingRemote") : t("fetchRemote")}
      >
        {fetchLoading ? (
          <span className="git-panel-spinner" aria-hidden />
        ) : (
          <RotateCw size={12} aria-hidden />
        )}
      </button>
    </div>
  );
}

type GitRootCurrentPathProps = {
    mode: GitMode;
    hasGitRoot: boolean;
    gitRoot: string | null;
    onScanGitRoots?: () => void;
    gitRootScanLoading: boolean;
};

export function GitRootCurrentPath({
    mode,
    hasGitRoot,
    gitRoot,
    onScanGitRoots,
    gitRootScanLoading,
}: GitRootCurrentPathProps) {
    const { t } = useTranslation("git");
    if (mode === "issues" || !hasGitRoot) {
        return null;
    }

    return (
        <div className="git-root-current">
            <span className="git-root-label">{t("pathLabel")}</span>
            <span className="git-root-path" title={gitRoot ?? ""}>
                {gitRoot}
            </span>
            {onScanGitRoots && (
                <button
                    type="button"
                    className="ghost git-root-button git-root-button--icon"
                    onClick={onScanGitRoots}
                    disabled={gitRootScanLoading}
                >
                    <ArrowLeftRight className="git-root-button-icon" aria-hidden />
                    {t("changeGitRoot")}
                </button>
            )}
        </div>
    );
}

type GitPerFileModeContentProps = {
  groups: PerFileDiffGroup[];
  selectedPath: string | null;
  onSelectFile?: (path: string) => void;
};

export function GitPerFileModeContent({
  groups,
  selectedPath,
  onSelectFile,
}: GitPerFileModeContentProps) {
  const { t } = useTranslation("git");
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedPaths((previous) => {
      if (previous.size === 0) {
        return previous;
      }

      const activePaths = new Set(groups.map((group) => group.path));
      let changed = false;
      const next = new Set<string>();

      for (const path of previous) {
        if (activePaths.has(path)) {
          next.add(path);
        } else {
          changed = true;
        }
      }

      if (!changed && next.size === previous.size) {
        return previous;
      }

      return next;
    });
  }, [groups]);

  const toggleGroup = useCallback((path: string) => {
    setCollapsedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (groups.length === 0) {
    return <div className="diff-empty">{t("noAgentEdits")}</div>;
  }

  return (
    <div className="per-file-tree">
      {groups.map((group) => {
        const isExpanded = !collapsedPaths.has(group.path);
        const { name: fileName } = splitPath(group.path);
        return (
          <div key={group.path} className="per-file-group">
            <button
              type="button"
              className="per-file-group-row"
              onClick={() => toggleGroup(group.path)}
            >
              <span className="per-file-group-chevron" aria-hidden>
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              <span className="per-file-group-path" title={group.path}>
                {fileName || group.path}
              </span>
              <span className="per-file-group-count">
                {t("editCount", { count: group.edits.length })}
              </span>
            </button>
            {isExpanded && (
              <div className="per-file-edit-list">
                {group.edits.map((edit) => {
                  const isActive = selectedPath === edit.id;
                  return (
                    <button
                      key={edit.id}
                      type="button"
                      className={`per-file-edit-row ${isActive ? "active" : ""}`}
                      onClick={() => onSelectFile?.(edit.id)}
                    >
                      <span className="per-file-edit-status" data-status={edit.status}>
                        {edit.status}
                      </span>
                      <span className="per-file-edit-label">
                        {t("editLabel", { count: edit.sequence })}
                      </span>
                      <span className="per-file-edit-stats">
                        {edit.additions > 0 && (
                          <span className="per-file-edit-stat per-file-edit-stat-add">
                            +{edit.additions}
                          </span>
                        )}
                        {edit.deletions > 0 && (
                          <span className="per-file-edit-stat per-file-edit-stat-del">
                            -{edit.deletions}
                          </span>
                        )}
                        {edit.additions === 0 && edit.deletions === 0 && (
                          <span className="per-file-edit-stat">0</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type GitDiffModeContentProps = {
    error: string | null | undefined;
    showGitRootPanel: boolean;
    onScanGitRoots?: () => void;
    gitRootScanLoading: boolean;
    gitRootScanDepth: number;
    onGitRootScanDepthChange?: (depth: number) => void;
    onPickGitRoot?: () => void | Promise<void>;
    onInitGitRepo?: () => void | Promise<void>;
    initGitRepoLoading: boolean;
    hasGitRoot: boolean;
    onClearGitRoot?: () => void;
    gitRootScanError: string | null | undefined;
    gitRootScanHasScanned: boolean;
    gitRootCandidates: string[];
    gitRoot: string | null;
    onSelectGitRoot?: (path: string) => void;
    showGenerateCommitMessage: boolean;
    showApplyWorktree: boolean;
    commitMessage: string;
    onCommitMessageChange?: (value: string) => void;
    commitMessageLoading: boolean;
    canGenerateCommitMessage: boolean;
    onGenerateCommitMessage?: () => void | Promise<void>;
    worktreeApplyTitle: string | null;
    worktreeApplyLoading: boolean;
    worktreeApplySuccess: boolean;
    onApplyWorktreeChanges?: () => void | Promise<void>;
    stagedFiles: DiffFile[];
    unstagedFiles: DiffFile[];
    commitLoading: boolean;
    onCommit?: () => void | Promise<void>;
    commitsAhead: number;
    commitsBehind: number;
    onPull?: () => void | Promise<void>;
    pullLoading: boolean;
    onPush?: () => void | Promise<void>;
    pushLoading: boolean;
    onSync?: () => void | Promise<void>;
    syncLoading: boolean;
    onStageAllChanges?: () => void | Promise<void>;
    onStageFile?: (path: string) => Promise<void> | void;
    onUnstageFile?: (path: string) => Promise<void> | void;
    onDiscardFile?: (path: string) => Promise<void> | void;
    onDiscardFiles?: (paths: string[]) => Promise<void> | void;
    onReviewUncommittedChanges?: () => void | Promise<void>;
    selectedFiles: Set<string>;
    selectedPath: string | null;
    onSelectFile?: (path: string) => void;
    onFileClick: (
        event: ReactMouseEvent<HTMLDivElement>,
        path: string,
        section: "staged" | "unstaged",
    ) => void;
    onShowFileMenu: (
        event: ReactMouseEvent<HTMLDivElement>,
        path: string,
        section: "staged" | "unstaged",
    ) => void;
    onDiffListClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function GitDiffModeContent({
    error,
    showGitRootPanel,
    onScanGitRoots,
    gitRootScanLoading,
    gitRootScanDepth,
    onGitRootScanDepthChange,
    onPickGitRoot,
    onInitGitRepo,
    initGitRepoLoading,
    hasGitRoot,
    onClearGitRoot,
    gitRootScanError,
    gitRootScanHasScanned,
    gitRootCandidates,
    gitRoot,
    onSelectGitRoot,
    showGenerateCommitMessage,
    showApplyWorktree,
    commitMessage,
    onCommitMessageChange,
    commitMessageLoading,
    canGenerateCommitMessage,
    onGenerateCommitMessage,
    worktreeApplyTitle,
    worktreeApplyLoading,
    worktreeApplySuccess,
    onApplyWorktreeChanges,
    stagedFiles,
    unstagedFiles,
    commitLoading,
    onCommit,
    commitsAhead,
    commitsBehind,
    onPull,
    pullLoading,
    onPush,
    pushLoading,
    onSync,
    syncLoading,
    onStageAllChanges,
    onStageFile,
    onUnstageFile,
    onDiscardFile,
    onDiscardFiles,
    onReviewUncommittedChanges,
    selectedFiles,
    selectedPath,
    onSelectFile,
    onFileClick,
    onShowFileMenu,
    onDiffListClick,
}: GitDiffModeContentProps) {
    const { t } = useTranslation("git");
    const normalizedGitRoot = normalizeRootPath(gitRoot);
    const missingRepo = isMissingRepo(error);
    const gitRootNotFound = isGitRootNotFound(error);
    const showInitGitRepo = Boolean(onInitGitRepo) && missingRepo && !gitRootNotFound;
    const gitRootTitle = gitRootNotFound
        ? t("gitRootNotFound")
        : missingRepo
            ? t("notRepoYet")
            : t("chooseRepo");
    const generateCommitMessageTooltip = t("generateCommitMessage");
    const showWorktreeApplyInUnstaged = showApplyWorktree && unstagedFiles.length > 0;
    const showWorktreeApplyInStaged =
        showApplyWorktree && unstagedFiles.length === 0 && stagedFiles.length > 0;

    return (
        <div className="diff-list" onClick={onDiffListClick}>
            {showGitRootPanel && (
                <div className="git-root-panel">
                    <div className="git-root-title">{gitRootTitle}</div>
                    {showInitGitRepo && (
                        <div className="git-root-primary-action">
                            <button
                                type="button"
                                className="primary git-root-button"
                                onClick={() => {
                                    void onInitGitRepo?.();
                                }}
                                disabled={initGitRepoLoading || gitRootScanLoading}
                            >
                                {initGitRepoLoading ? t("initializingGit") : t("initializeGit")}
                            </button>
                        </div>
                    )}
                    <div className="git-root-actions">
                        <button
                            type="button"
                            className="ghost git-root-button"
                            onClick={onScanGitRoots}
                            disabled={!onScanGitRoots || gitRootScanLoading || initGitRepoLoading}
                        >
                            {t("scanWorkspace")}
                        </button>
                        <label className="git-root-depth">
                            <span>{t("depthLabel")}</span>
                            <select
                                className="git-root-select"
                                value={gitRootScanDepth}
                                onChange={(event) => {
                                    const value = Number(event.target.value);
                                    if (!Number.isNaN(value)) {
                                        onGitRootScanDepthChange?.(value);
                                    }
                                }}
                                disabled={gitRootScanLoading || initGitRepoLoading}
                            >
                                {DEPTH_OPTIONS.map((depth) => (
                                    <option key={depth} value={depth}>
                                        {depth}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {onPickGitRoot && (
                            <button
                                type="button"
                                className="ghost git-root-button"
                                onClick={() => {
                                    void onPickGitRoot();
                                }}
                                disabled={gitRootScanLoading || initGitRepoLoading}
                            >
                                {t("pickFolder")}
                            </button>
                        )}
                        {hasGitRoot && onClearGitRoot && (
                            <button
                                type="button"
                                className="ghost git-root-button"
                                onClick={onClearGitRoot}
                                disabled={gitRootScanLoading || initGitRepoLoading}
                            >
                                {t("useWorkspaceRoot")}
                            </button>
                        )}
                    </div>
                    {gitRootScanLoading && <div className="diff-empty">{t("scanningRepositories")}</div>}
                    {!gitRootScanLoading &&
                        !gitRootScanError &&
                        gitRootScanHasScanned &&
                        gitRootCandidates.length === 0 && <div className="diff-empty">{t("noRepositoriesFound")}</div>}
                    {gitRootCandidates.length > 0 && (
                        <div className="git-root-list">
                            {gitRootCandidates.map((path) => {
                                const normalizedPath = normalizeRootPath(path);
                                const isActive = normalizedGitRoot && normalizedGitRoot === normalizedPath;
                                return (
                                    <button
                                        key={path}
                                        type="button"
                                        className={`git-root-item ${isActive ? "active" : ""}`}
                                        onClick={() => onSelectGitRoot?.(path)}
                                    >
                                        <span className="git-root-path">{path}</span>
                                        {isActive && <span className="git-root-tag">{t("active")}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            {showGenerateCommitMessage && (
                <div className="commit-message-section">
                    <div className="commit-message-input-wrapper">
                        <textarea
                            className="commit-message-input"
                            placeholder={t("commitMessagePlaceholder")}
                            value={commitMessage}
                            onChange={(event) => onCommitMessageChange?.(event.target.value)}
                            disabled={commitMessageLoading}
                            rows={2}
                        />
                        <button
                            type="button"
                            className="commit-message-generate-button diff-row-action ds-tooltip-trigger"
                            onClick={() => {
                                if (!canGenerateCommitMessage) {
                                    return;
                                }
                                void onGenerateCommitMessage?.();
                            }}
                            disabled={commitMessageLoading || !canGenerateCommitMessage}
                            title={generateCommitMessageTooltip}
                            data-tooltip={generateCommitMessageTooltip}
                            data-tooltip-placement="bottom"
                            data-tooltip-align="end"
                            aria-label={generateCommitMessageTooltip}
                        >
                            {commitMessageLoading ? (
                                <MagicSparkleLoaderIcon className="commit-message-loader" />
                            ) : (
                                <MagicSparkleIcon />
                            )}
                        </button>
                    </div>
                    <CommitButton
                        commitMessage={commitMessage}
                        hasStagedFiles={stagedFiles.length > 0}
                        hasUnstagedFiles={unstagedFiles.length > 0}
                        commitLoading={commitLoading}
                        onCommit={onCommit}
                    />
                </div>
            )}
            {(commitsAhead > 0 || commitsBehind > 0) && !stagedFiles.length && (
                <div className="push-section">
                    <div className="push-sync-buttons">
                        {commitsBehind > 0 && (
                            <button
                                type="button"
                                className="push-button-secondary"
                                onClick={() => void onPull?.()}
                                disabled={!onPull || pullLoading || syncLoading}
                                title={t("pullCount", { count: commitsBehind })}
                            >
                                {pullLoading ? (
                                    <span className="commit-button-spinner" aria-hidden />
                                ) : (
                                    <Download size={14} aria-hidden />
                                )}
                                <span>{pullLoading ? t("pulling") : t("pull")}</span>
                                <span className="push-count">{commitsBehind}</span>
                            </button>
                        )}
                        {commitsAhead > 0 && (
                            <button
                                type="button"
                                className="push-button"
                                onClick={() => void onPush?.()}
                                disabled={!onPush || pushLoading || commitsBehind > 0}
                                title={
                                    commitsBehind > 0
                                        ? t("remoteAheadTooltip")
                                        : t("pushCount", { count: commitsAhead })
                                }
                            >
                                {pushLoading ? (
                                    <span className="commit-button-spinner" aria-hidden />
                                ) : (
                                    <Upload size={14} aria-hidden />
                                )}
                                <span>{t("push")}</span>
                                <span className="push-count">{commitsAhead}</span>
                            </button>
                        )}
                    </div>
                    {commitsAhead > 0 && commitsBehind > 0 && (
                        <button
                            type="button"
                            className="push-button-secondary"
                            onClick={() => void onSync?.()}
                            disabled={!onSync || syncLoading || pullLoading}
                            title={t("syncTooltip")}
                        >
                            {syncLoading ? (
                                <span className="commit-button-spinner" aria-hidden />
                            ) : (
                                <RotateCcw size={14} aria-hidden />
                            )}
                            <span>{syncLoading ? t("syncing") : t("syncPullPush")}</span>
                        </button>
                    )}
                </div>
            )}
            {!error &&
                !stagedFiles.length &&
                !unstagedFiles.length &&
                commitsAhead === 0 &&
                commitsBehind === 0 && <div className="diff-empty">{t("noChangesDetected")}</div>}
            {(stagedFiles.length > 0 || unstagedFiles.length > 0) && (
                <>
                    {stagedFiles.length > 0 && (
                        <DiffSection
                            title={t("staged")}
                            files={stagedFiles}
                            section="staged"
                            selectedFiles={selectedFiles}
                            selectedPath={selectedPath}
                            onSelectFile={onSelectFile}
                            onUnstageFile={onUnstageFile}
                            onDiscardFile={onDiscardFile}
                            onDiscardFiles={onDiscardFiles}
                            showWorktreeApplyAction={showWorktreeApplyInStaged}
                            worktreeApplyTitle={worktreeApplyTitle}
                            worktreeApplyLoading={worktreeApplyLoading}
                            worktreeApplySuccess={worktreeApplySuccess}
                            onApplyWorktreeChanges={onApplyWorktreeChanges}
                            onFileClick={onFileClick}
                            onShowFileMenu={onShowFileMenu}
                        />
                    )}
                    {unstagedFiles.length > 0 && (
                        <DiffSection
                            title={t("unstaged")}
                            files={unstagedFiles}
                            section="unstaged"
                            selectedFiles={selectedFiles}
                            selectedPath={selectedPath}
                            onSelectFile={onSelectFile}
                            onStageAllChanges={onStageAllChanges}
                            onStageFile={onStageFile}
                            onDiscardFile={onDiscardFile}
                            onDiscardFiles={onDiscardFiles}
                            onReviewUncommittedChanges={onReviewUncommittedChanges}
                            showWorktreeApplyAction={showWorktreeApplyInUnstaged}
                            worktreeApplyTitle={worktreeApplyTitle}
                            worktreeApplyLoading={worktreeApplyLoading}
                            worktreeApplySuccess={worktreeApplySuccess}
                            onApplyWorktreeChanges={onApplyWorktreeChanges}
                            onFileClick={onFileClick}
                            onShowFileMenu={onShowFileMenu}
                        />
                    )}
                </>
            )}
        </div>
    );
}

type GitLogModeContentProps = {
    logError: string | null | undefined;
    logLoading: boolean;
    logEntries: GitLogEntry[];
    showAheadSection: boolean;
    showBehindSection: boolean;
    logAheadEntries: GitLogEntry[];
    logBehindEntries: GitLogEntry[];
    selectedCommitSha: string | null;
    onSelectCommit?: (entry: GitLogEntry) => void;
    onShowLogMenu: (event: ReactMouseEvent<HTMLDivElement>, entry: GitLogEntry) => void;
};

export function GitLogModeContent({
    logError,
    logLoading,
    logEntries,
    showAheadSection,
    showBehindSection,
    logAheadEntries,
    logBehindEntries,
    selectedCommitSha,
    onSelectCommit,
    onShowLogMenu,
}: GitLogModeContentProps) {
    const { t } = useTranslation("git");
    return (
        <div className="git-log-list">
            {!logError && logLoading && <div className="diff-viewer-loading">{t("loadingCommits")}</div>}
            {!logError &&
                !logLoading &&
                !logEntries.length &&
                !showAheadSection &&
                !showBehindSection && <div className="diff-empty">{t("noCommitsYet")}</div>}
            {showAheadSection && (
                <div className="git-log-section">
                    <div className="git-log-section-title">{t("toPush")}</div>
                    <div className="git-log-section-list">
                        {logAheadEntries.map((entry) => {
                            const isSelected = selectedCommitSha === entry.sha;
                            return (
                                <GitLogEntryRow
                                    key={entry.sha}
                                    entry={entry}
                                    isSelected={isSelected}
                                    compact
                                    onSelect={onSelectCommit}
                                    onContextMenu={(event) => onShowLogMenu(event, entry)}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
            {showBehindSection && (
                <div className="git-log-section">
                    <div className="git-log-section-title">{t("toPull")}</div>
                    <div className="git-log-section-list">
                        {logBehindEntries.map((entry) => {
                            const isSelected = selectedCommitSha === entry.sha;
                            return (
                                <GitLogEntryRow
                                    key={entry.sha}
                                    entry={entry}
                                    isSelected={isSelected}
                                    compact
                                    onSelect={onSelectCommit}
                                    onContextMenu={(event) => onShowLogMenu(event, entry)}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
            {(logEntries.length > 0 || logLoading) && (
                <div className="git-log-section">
                    <div className="git-log-section-title">{t("recentCommits")}</div>
                    <div className="git-log-section-list">
                        {logEntries.map((entry) => {
                            const isSelected = selectedCommitSha === entry.sha;
                            return (
                                <GitLogEntryRow
                                    key={entry.sha}
                                    entry={entry}
                                    isSelected={isSelected}
                                    onSelect={onSelectCommit}
                                    onContextMenu={(event) => onShowLogMenu(event, entry)}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

type GitIssuesModeContentProps = {
    issuesError: string | null | undefined;
    issuesLoading: boolean;
    issues: GitHubIssue[];
};

export function GitIssuesModeContent({
    issuesError,
    issuesLoading,
    issues,
}: GitIssuesModeContentProps) {
    const { t } = useTranslation("git");
    return (
        <div className="git-issues-list">
            {!issuesError && !issuesLoading && !issues.length && (
                <div className="diff-empty">{t("noOpenIssues")}</div>
            )}
            {issues.map((issue) => {
                const relativeTime = formatRelativeTime(new Date(issue.updatedAt).getTime());
                return (
                    <a
                        key={issue.number}
                        className="git-issue-entry"
                        href={issue.url}
                        onClick={(event) => {
                            event.preventDefault();
                            void openUrl(issue.url);
                        }}
                    >
                        <div className="git-issue-summary">
                            <span className="git-issue-title">
                                <span className="git-issue-number">#{issue.number}</span>{" "}
                                {issue.title} <span className="git-issue-date">· {relativeTime}</span>
                            </span>
                        </div>
                    </a>
                );
            })}
        </div>
    );
}

type GitPullRequestsModeContentProps = {
    pullRequestsError: string | null | undefined;
    pullRequestsLoading: boolean;
    pullRequests: GitHubPullRequest[];
    selectedPullRequest: number | null;
    onSelectPullRequest?: (pullRequest: GitHubPullRequest) => void;
    onShowPullRequestMenu: (
        event: ReactMouseEvent<HTMLDivElement>,
        pullRequest: GitHubPullRequest,
    ) => void;
};

export function GitPullRequestsModeContent({
    pullRequestsError,
    pullRequestsLoading,
    pullRequests,
    selectedPullRequest,
    onSelectPullRequest,
    onShowPullRequestMenu,
}: GitPullRequestsModeContentProps) {
    const { t } = useTranslation("git");
    return (
        <div className="git-pr-list">
            {!pullRequestsError && !pullRequestsLoading && !pullRequests.length && (
                <div className="diff-empty">{t("noOpenPullRequests")}</div>
            )}
            {pullRequests.map((pullRequest) => {
                const relativeTime = formatRelativeTime(new Date(pullRequest.updatedAt).getTime());
                const author = pullRequest.author?.login ?? t("common:labels.unknown");
                const isSelected = selectedPullRequest === pullRequest.number;

                return (
                    <div
                        key={pullRequest.number}
                        className={`git-pr-entry ${isSelected ? "active" : ""}`}
                        onClick={() => onSelectPullRequest?.(pullRequest)}
                        onContextMenu={(event) => onShowPullRequestMenu(event, pullRequest)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSelectPullRequest?.(pullRequest);
                            }
                        }}
                    >
                        <div className="git-pr-header">
                            <span className="git-pr-title">
                                <span className="git-pr-number">#{pullRequest.number}</span>
                                <span className="git-pr-title-text">
                                    {pullRequest.title} <span className="git-pr-author-inline">@{author}</span>
                                </span>
                            </span>
                            <span className="git-pr-time">{relativeTime}</span>
                        </div>
                        <div className="git-pr-meta">
                            {pullRequest.isDraft && <span className="git-pr-pill git-pr-draft">{t("draft")}</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
