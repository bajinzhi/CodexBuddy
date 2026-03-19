import { useCallback, useEffect, useRef, useState } from "react";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import type { WorkspaceInfo } from "../../../types";
import { isMobilePlatform } from "../../../utils/platformPaths";
import { pickWorkspacePaths } from "../../../services/tauri";
import type { AddWorkspacesFromPathsResult } from "../../workspaces/hooks/useWorkspaceCrud";

const RECENT_REMOTE_WORKSPACE_PATHS_STORAGE_KEY = "mobile-remote-workspace-recent-paths";
const RECENT_REMOTE_WORKSPACE_PATHS_LIMIT = 5;

function parseWorkspacePathInput(value: string) {
  const stripWrappingQuotes = (entry: string) => {
    const trimmed = entry.trim();
    if (trimmed.length < 2) {
      return trimmed;
    }
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "'" || first === '"') && first === last) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  };

  return value
    .split(/\r?\n|,|;/)
    .map((entry) => stripWrappingQuotes(entry))
    .filter(Boolean);
}

function appendPathIfMissing(value: string, path: string) {
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    return value;
  }
  const entries = parseWorkspacePathInput(value);
  if (entries.includes(trimmedPath)) {
    return value;
  }
  return [...entries, trimmedPath].join("\n");
}

function loadRecentRemoteWorkspacePaths(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(RECENT_REMOTE_WORKSPACE_PATHS_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, RECENT_REMOTE_WORKSPACE_PATHS_LIMIT);
  } catch {
    return [];
  }
}

function persistRecentRemoteWorkspacePaths(paths: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    RECENT_REMOTE_WORKSPACE_PATHS_STORAGE_KEY,
    JSON.stringify(paths),
  );
}

function mergeRecentRemoteWorkspacePaths(current: string[], nextPaths: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  const push = (entry: string) => {
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    merged.push(trimmed);
  };
  nextPaths.forEach(push);
  current.forEach(push);
  return merged.slice(0, RECENT_REMOTE_WORKSPACE_PATHS_LIMIT);
}

type MobileRemoteWorkspacePathPromptState = {
  value: string;
  error: string | null;
  recentPaths: string[];
} | null;

export function useWorkspaceDialogs() {
  const { t } = useTranslation(["app", "common"]);
  const [recentMobileRemoteWorkspacePaths, setRecentMobileRemoteWorkspacePaths] = useState<
    string[]
  >(() => loadRecentRemoteWorkspacePaths());
  const [mobileRemoteWorkspacePathPrompt, setMobileRemoteWorkspacePathPrompt] =
    useState<MobileRemoteWorkspacePathPromptState>(null);
  const mobileRemoteWorkspacePathResolveRef = useRef<((paths: string[]) => void) | null>(
    null,
  );

  const resolveMobileRemoteWorkspacePathRequest = useCallback((paths: string[]) => {
    const resolve = mobileRemoteWorkspacePathResolveRef.current;
    mobileRemoteWorkspacePathResolveRef.current = null;
    if (resolve) {
      resolve(paths);
    }
  }, []);

  const requestMobileRemoteWorkspacePaths = useCallback(() => {
    if (mobileRemoteWorkspacePathResolveRef.current) {
      resolveMobileRemoteWorkspacePathRequest([]);
    }

    setMobileRemoteWorkspacePathPrompt({
      value: "",
      error: null,
      recentPaths: recentMobileRemoteWorkspacePaths,
    });

    return new Promise<string[]>((resolve) => {
      mobileRemoteWorkspacePathResolveRef.current = resolve;
    });
  }, [recentMobileRemoteWorkspacePaths, resolveMobileRemoteWorkspacePathRequest]);

  const updateMobileRemoteWorkspacePathInput = useCallback((value: string) => {
    setMobileRemoteWorkspacePathPrompt((prev) =>
      prev
        ? {
            ...prev,
            value,
            error: null,
          }
        : prev,
    );
  }, []);

  const cancelMobileRemoteWorkspacePathPrompt = useCallback(() => {
    setMobileRemoteWorkspacePathPrompt(null);
    resolveMobileRemoteWorkspacePathRequest([]);
  }, [resolveMobileRemoteWorkspacePathRequest]);

  const appendMobileRemoteWorkspacePathFromRecent = useCallback((path: string) => {
    setMobileRemoteWorkspacePathPrompt((prev) =>
      prev
        ? {
            ...prev,
            value: appendPathIfMissing(prev.value, path),
            error: null,
          }
        : prev,
    );
  }, []);

  const rememberRecentMobileRemoteWorkspacePaths = useCallback((paths: string[]) => {
    setRecentMobileRemoteWorkspacePaths((prev) => {
      const next = mergeRecentRemoteWorkspacePaths(prev, paths);
      persistRecentRemoteWorkspacePaths(next);
      return next;
    });
    setMobileRemoteWorkspacePathPrompt((prev) =>
      prev
        ? {
            ...prev,
            recentPaths: mergeRecentRemoteWorkspacePaths(prev.recentPaths, paths),
          }
        : prev,
    );
  }, []);

  const submitMobileRemoteWorkspacePathPrompt = useCallback(() => {
    if (!mobileRemoteWorkspacePathPrompt) {
      return;
    }
    const paths = parseWorkspacePathInput(mobileRemoteWorkspacePathPrompt.value);
    if (paths.length === 0) {
      setMobileRemoteWorkspacePathPrompt((prev) =>
        prev
          ? {
              ...prev,
              error: t("app:workspaces.enterAbsoluteDirectoryPath"),
            }
          : prev,
      );
      return;
    }
    setMobileRemoteWorkspacePathPrompt(null);
    resolveMobileRemoteWorkspacePathRequest(paths);
  }, [mobileRemoteWorkspacePathPrompt, resolveMobileRemoteWorkspacePathRequest]);

  useEffect(() => {
    return () => {
      resolveMobileRemoteWorkspacePathRequest([]);
    };
  }, [resolveMobileRemoteWorkspacePathRequest]);

  const requestWorkspacePaths = useCallback(async (backendMode?: string) => {
    if (isMobilePlatform() && backendMode === "remote") {
      return requestMobileRemoteWorkspacePaths();
    }
    return pickWorkspacePaths();
  }, [requestMobileRemoteWorkspacePaths]);

  const showAddWorkspacesResult = useCallback(
    async (result: AddWorkspacesFromPathsResult) => {
      const hasIssues =
        result.skippedExisting.length > 0 ||
        result.skippedInvalid.length > 0 ||
        result.failures.length > 0;
      if (!hasIssues) {
        return;
      }

      const lines: string[] = [];
      lines.push(t("app:workspaces.added", { count: result.added.length }));
      if (result.skippedExisting.length > 0) {
        lines.push(
          t("app:workspaces.skippedExisting", {
            count: result.skippedExisting.length,
          }),
        );
      }
      if (result.skippedInvalid.length > 0) {
        lines.push(
          t("app:workspaces.skippedInvalid", {
            count: result.skippedInvalid.length,
          }),
        );
      }
      if (result.failures.length > 0) {
        lines.push(t("app:workspaces.failedToAdd", { count: result.failures.length }));
        const details = result.failures
          .slice(0, 3)
          .map(({ path, message: failureMessage }) => `- ${path}: ${failureMessage}`);
        if (result.failures.length > 3) {
          details.push(
            t("app:workspaces.moreFailures", {
              count: result.failures.length - 3,
            }),
          );
        }
        lines.push("");
        lines.push(t("app:workspaces.failuresHeading"));
        lines.push(...details);
      }

      const title =
        result.failures.length > 0
          ? t("app:workspaces.someFailedTitle")
          : t("app:workspaces.someSkippedTitle");
      await message(lines.join("\n"), {
        title,
        kind: result.failures.length > 0 ? "error" : "warning",
      });
    },
    [t],
  );

  const confirmWorkspaceRemoval = useCallback(
    async (workspaces: WorkspaceInfo[], workspaceId: string) => {
      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      const workspaceName =
        workspace?.name || t("app:workspaces.workspaceFallback");
      const worktreeCount = workspaces.filter(
        (entry) => entry.parentId === workspaceId,
      ).length;
      const detail =
        worktreeCount > 0
          ? t("app:workspaces.deleteWorkspaceDetail", { count: worktreeCount })
          : "";

      return ask(
        t("app:workspaces.deleteWorkspacePrompt", {
          name: workspaceName,
          detail,
          count: worktreeCount,
        }),
        {
          title: t("app:workspaces.deleteWorkspaceTitle"),
          kind: "warning",
          okLabel: t("common:actions.delete"),
          cancelLabel: t("common:actions.cancel"),
        },
      );
    },
    [t],
  );

  const confirmWorktreeRemoval = useCallback(
    async (workspaces: WorkspaceInfo[], workspaceId: string) => {
      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      const workspaceName =
        workspace?.name || t("app:workspaces.worktreeFallback");
      return ask(
        t("app:workspaces.deleteWorktreePrompt", { name: workspaceName }),
        {
          title: t("app:workspaces.deleteWorktreeTitle"),
          kind: "warning",
          okLabel: t("common:actions.delete"),
          cancelLabel: t("common:actions.cancel"),
        },
      );
    },
    [t],
  );

  const showWorkspaceRemovalError = useCallback(async (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await message(errorMessage, {
      title: t("app:workspaces.deleteWorkspaceFailed"),
      kind: "error",
    });
  }, [t]);

  const showWorktreeRemovalError = useCallback(async (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await message(errorMessage, {
      title: t("app:workspaces.deleteWorktreeFailed"),
      kind: "error",
    });
  }, [t]);

  return {
    requestWorkspacePaths,
    mobileRemoteWorkspacePathPrompt,
    updateMobileRemoteWorkspacePathInput,
    cancelMobileRemoteWorkspacePathPrompt,
    submitMobileRemoteWorkspacePathPrompt,
    appendMobileRemoteWorkspacePathFromRecent,
    rememberRecentMobileRemoteWorkspacePaths,
    showAddWorkspacesResult,
    confirmWorkspaceRemoval,
    confirmWorktreeRemoval,
    showWorkspaceRemovalError,
    showWorktreeRemovalError,
  };
}
