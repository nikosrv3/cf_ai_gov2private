// src/hooks/useRunPolling.ts
import { useEffect, useRef, useState } from "react";
import { getRun, type RunData, type RunStatus } from "../lib/api";

interface UseRunPollingOptions {
  intervalMs?: number;         // base interval while pending
  idleIntervalMs?: number;     // slower interval once done/error (0 = stop)
  pauseWhenHidden?: boolean;   // pause when tab not visible
}

interface UseRunPollingResult {
  run: RunData | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
  setRun: React.Dispatch<React.SetStateAction<RunData | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

const ACTIVE_STATUSES: RunStatus[] = ["queued", "pending", "generating", "role_selection"];
const TERMINAL_STATUSES: RunStatus[] = ["done", "error"];

export function useRunPolling(
  runId: string | undefined,
  { 
    intervalMs = 2500, 
    idleIntervalMs = 0, 
    pauseWhenHidden = true 
  }: UseRunPollingOptions = {}
): UseRunPollingResult {
  const [run, setRun] = useState<RunData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const timer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function clearTimer() {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }

  async function fetchOnce(signal?: AbortSignal): Promise<RunData | null> {
    if (!runId || running.current) return null;
    
    running.current = true;
    
    try {
      const data = await getRun(runId, signal);
      
      if (!mounted.current) return null;
      
      setRun(data);
      setError(null);

      // Check if we should stop or slow down polling
      const status = data.status as RunStatus;
      
      if (TERMINAL_STATUSES.includes(status)) {
        if (idleIntervalMs <= 0) {
          clearTimer();
        } else if (timer.current) {
          // Switch to idle interval
          clearTimer();
          timer.current = window.setInterval(tick, idleIntervalMs) as any;
        }
      }
      
      return data;
    } catch (err: any) {
      if (!mounted.current) return null;
      
      if (err?.name !== "AbortError") {
        const message = err?.message || "Failed to load run";
        setError(message);
      }
      return null;
    } finally {
      running.current = false;
    }
  }

  const tick = () => {
    // Pause when tab is hidden (optional)
    if (pauseWhenHidden && document.visibilityState === "hidden") return;
    
    // Fresh abort controller per tick
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    fetchOnce(ctrl.signal);
  };

  const refresh = () => {
    if (!runId) return;
    
    // Cancel any ongoing request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    
    setLoading(true);
    fetchOnce(ctrl.signal).finally(() => {
      if (mounted.current) setLoading(false);
    });
  };

  // Start/stop polling on runId change
  useEffect(() => {
    clearTimer();
    abortRef.current?.abort();
    setError(null);
    setRun(null);

    if (!runId) return;

    // Initial fetch
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    
    fetchOnce(ctrl.signal).then((data) => {
      if (!mounted.current) return;
      
      setLoading(false);
      
      // Start polling if status is active
      if (data && ACTIVE_STATUSES.includes(data.status as RunStatus)) {
        timer.current = window.setInterval(tick, intervalMs) as any;
      } else if (data && idleIntervalMs > 0) {
        // Start idle polling for completed runs
        timer.current = window.setInterval(tick, idleIntervalMs) as any;
      }
    });

    return () => {
      clearTimer();
      abortRef.current?.abort();
    };
  }, [runId, intervalMs, idleIntervalMs]);

  // Handle visibility changes
  useEffect(() => {
    if (!pauseWhenHidden) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && run && runId) {
        // Resume polling when tab becomes visible
        tick();
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [pauseWhenHidden, run, runId]);

  return {
    run,
    error,
    loading,
    refresh,
    setRun,
    setError,
  };
}