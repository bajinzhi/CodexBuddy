import { useEffect, useRef } from "react";
import type { AiRadarSettings } from "@/types";
import { aiRadarRefresh, aiRadarSchedulerStatus } from "@services/tauri";

const MIN_INTERVAL_MS = 5 * 60 * 1000;

export function useAiRadarScheduler(settings: AiRadarSettings | null | undefined) {
  const runningRef = useRef(false);

  useEffect(() => {
    if (!settings?.enabled) {
      return;
    }
    let canceled = false;
    const intervalMs = Math.max(
      MIN_INTERVAL_MS,
      Math.round(settings.refreshIntervalMinutes || 60) * 60 * 1000,
    );

    const refreshIfDue = async () => {
      if (runningRef.current || canceled) {
        return;
      }
      runningRef.current = true;
      try {
        const status = await aiRadarSchedulerStatus();
        if (!canceled && status.due) {
          await aiRadarRefresh();
        }
      } catch (error) {
        console.warn("AI radar scheduled refresh failed", error);
      } finally {
        runningRef.current = false;
      }
    };

    const startupTimer = window.setTimeout(() => void refreshIfDue(), 5000);
    const interval = window.setInterval(() => void refreshIfDue(), intervalMs);
    return () => {
      canceled = true;
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, [settings?.enabled, settings?.refreshIntervalMinutes]);
}
