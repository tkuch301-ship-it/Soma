"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "soma-actor";
const CHANGE_EVENT = "soma-actor-change";

export interface Actor {
  id: number;
  name: string;
}

function isActor(value: unknown): value is Actor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "number" && typeof candidate.name === "string";
}

/** Reads the currently selected "自分" (self) actor from localStorage. */
export function readActor(): Actor | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isActor(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persists (or clears, when null) the selected actor and notifies listeners in this tab. */
export function writeActor(actor: Actor | null): void {
  if (typeof window === "undefined") return;
  if (actor) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(actor));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** React hook exposing the currently selected actor, reactive across components/tabs. */
export function useActor(): [Actor | null, (actor: Actor | null) => void] {
  const [actor, setActorState] = useState<Actor | null>(null);

  useEffect(() => {
    setActorState(readActor());
    const handler = () => setActorState(readActor());
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const setActor = useCallback((next: Actor | null) => {
    writeActor(next);
    setActorState(next);
  }, []);

  return [actor, setActor];
}
