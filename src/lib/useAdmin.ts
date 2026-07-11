"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { api } from "@/lib/api";

export interface AdminContextValue {
  /** True once the initial GET /api/admin/session check has completed. */
  ready: boolean;
  admin: boolean;
  /** Whether the login modal is currently open (used to pause board polling). */
  loginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  login: (password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

/**
 * Shares admin session state (and the login modal's open/closed state) across
 * the whole app via context, so the header widget, task board, project list
 * and detail panels can all read/react to the same `admin` boolean without
 * prop-drilling a fetch in every page.
 *
 * Note: this file stays a plain `.ts` module (no JSX) so it uses
 * `createElement` instead of JSX syntax.
 */
export function AdminProvider({ children }: { children: ReactNode }): ReactElement {
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api.adminSession();
        if (!cancelled) setAdmin(session.admin);
      } catch {
        // Treat any failure to check the session as "not admin"; the user can
        // still retry via the login button.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (password: string) => {
    const result = await api.adminLogin(password);
    if (result.ok) {
      setAdmin(true);
      setLoginModalOpen(false);
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    await api.adminLogout();
    setAdmin(false);
  }, []);

  const value: AdminContextValue = {
    ready,
    admin,
    loginModalOpen,
    openLoginModal: () => setLoginModalOpen(true),
    closeLoginModal: () => setLoginModalOpen(false),
    login,
    logout,
  };

  return createElement(AdminContext.Provider, { value }, children);
}

/** Reads the shared admin session/modal state. Must be used within an <AdminProvider>. */
export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdmin must be used within an <AdminProvider>");
  }
  return ctx;
}
