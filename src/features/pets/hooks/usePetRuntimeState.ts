import { useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalRequest, RequestUserInputRequest } from "@/types";
import {
  resolvePetRuntimeState,
  type PetRuntimeState,
} from "@/features/pets/petRuntime";

export type ThreadStatusLookup = Record<
  string,
  | {
      isProcessing: boolean;
      processingStartedAt?: number | null;
    }
  | undefined
>;

export type UsePetRuntimeStateArgs = {
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusLookup;
  approvals: ApprovalRequest[];
  userInputRequests: RequestUserInputRequest[];
};

function hasWorkspaceRequest<T extends { workspace_id: string }>(
  requests: T[],
  activeWorkspaceId: string | null,
): boolean {
  if (!activeWorkspaceId) {
    return requests.length > 0;
  }
  return requests.some((request) => request.workspace_id === activeWorkspaceId);
}

function getProcessingStartedAt(
  activeThreadId: string | null,
  threadStatusById: ThreadStatusLookup,
): number | null {
  const activeStatus = activeThreadId ? threadStatusById[activeThreadId] : undefined;
  if (activeStatus?.isProcessing) {
    return activeStatus.processingStartedAt ?? Date.now();
  }

  let earliest: number | null = null;
  for (const status of Object.values(threadStatusById)) {
    if (!status?.isProcessing) {
      continue;
    }
    const startedAt = status.processingStartedAt ?? Date.now();
    earliest = earliest === null ? startedAt : Math.min(earliest, startedAt);
  }
  return earliest;
}

export function usePetRuntimeState({
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  approvals,
  userInputRequests,
}: UsePetRuntimeStateArgs): PetRuntimeState {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const wasProcessingRef = useRef(false);
  const lastCompletedAtRef = useRef<number | null>(null);
  const idleSinceRef = useRef<number | null>(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const processingStartedAtMs = useMemo(
    () => getProcessingStartedAt(activeThreadId, threadStatusById),
    [activeThreadId, threadStatusById],
  );
  const isProcessing = processingStartedAtMs !== null;

  useEffect(() => {
    if (isProcessing) {
      idleSinceRef.current = null;
      wasProcessingRef.current = true;
      return;
    }
    if (wasProcessingRef.current) {
      lastCompletedAtRef.current = Date.now();
      idleSinceRef.current = Date.now();
    } else if (idleSinceRef.current === null) {
      idleSinceRef.current = Date.now();
    }
    wasProcessingRef.current = false;
  }, [isProcessing]);

  return resolvePetRuntimeState({
    nowMs,
    hasApprovalRequest: hasWorkspaceRequest(approvals, activeWorkspaceId),
    hasUserInputRequest: hasWorkspaceRequest(userInputRequests, activeWorkspaceId),
    processingStartedAtMs,
    lastCompletedAtMs: lastCompletedAtRef.current,
    idleSinceMs: idleSinceRef.current,
  });
}
