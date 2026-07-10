"use client";

import { useEffect, useRef } from "react";

interface UseAutoRefreshOptions {
  /** Polling interval in milliseconds. Defaults to 15000 (15s). */
  intervalMs?: number;
  /** Polling is fully disabled when false (e.g. while an edit form/panel is open). */
  enabled: boolean;
}

const DEFAULT_INTERVAL_MS = 15000;
// Minimum time between "immediate" runs triggered by focus/visibility events,
// so that rapidly toggling tabs/windows doesn't fire the callback repeatedly.
const IMMEDIATE_DEBOUNCE_MS = 3000;

/**
 * Runs `callback` on an interval while the tab is visible and `enabled` is
 * true, and also runs it immediately (debounced) whenever the page becomes
 * visible again or the window regains focus. This keeps shared/multi-user
 * data (like the task board) fresh without requiring a manual reload,
 * without needing a WebSocket connection.
 */
export function useAutoRefresh(
  callback: () => unknown,
  options: UseAutoRefreshOptions
): void {
  const { enabled, intervalMs = DEFAULT_INTERVAL_MS } = options;

  // Keep the latest callback in a ref so the interval/listeners don't need
  // to be torn down and recreated every time the caller passes a new
  // (e.g. inline) function.
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const lastRunAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    function runImmediate() {
      const now = Date.now();
      if (now - lastRunAtRef.current < IMMEDIATE_DEBOUNCE_MS) return;
      lastRunAtRef.current = now;
      callbackRef.current();
    }

    function tick() {
      if (document.visibilityState !== "visible") return;
      lastRunAtRef.current = Date.now();
      callbackRef.current();
    }

    const intervalId = window.setInterval(tick, intervalMs);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        runImmediate();
      }
    }

    function handleFocus() {
      runImmediate();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, intervalMs]);
}
