import { useCallback, useEffect, useState } from "react";
import {
  getThreadGoal,
  STORAGE_KEY_THREAD_GOALS,
  THREAD_GOALS_CHANGED_EVENT,
  type ThreadGoal,
} from "@threads/utils/threadStorage";

export function useThreadGoalIndicator(
  workspaceId: string | null,
  threadId: string | null,
): ThreadGoal | null {
  const readGoal = useCallback(() => {
    if (!workspaceId || !threadId) {
      return null;
    }
    return getThreadGoal(workspaceId, threadId);
  }, [threadId, workspaceId]);

  const [goal, setGoal] = useState<ThreadGoal | null>(() => readGoal());

  useEffect(() => {
    setGoal(readGoal());
  }, [readGoal]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refresh = () => {
      setGoal(readGoal());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY_THREAD_GOALS) {
        refresh();
      }
    };

    window.addEventListener(THREAD_GOALS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(THREAD_GOALS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, [readGoal]);

  return goal;
}
