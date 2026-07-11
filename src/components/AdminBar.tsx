"use client";

import { FormEvent, useState } from "react";
import { useAdmin } from "@/lib/useAdmin";

/**
 * Header widget shared by the top page and the project board: shows a
 * "🔑 管理者" login button for regular members, or a "🛡 管理者モード" badge
 * + logout button once logged in. Owns the password login modal.
 */
export default function AdminBar() {
  const { ready, admin, loginModalOpen, openLoginModal, closeLoginModal, login, logout } = useAdmin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  function handleClose() {
    setPassword("");
    setError(null);
    closeLoginModal();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(password);
      if (!result.ok) {
        setError(result.message);
      } else {
        setPassword("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  // Avoid flashing the "🔑 管理者" button for already-logged-in admins while
  // the initial session check is still in flight.
  if (!ready) {
    return <div className="h-9" aria-hidden="true" />;
  }

  return (
    <>
      {admin ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
            🛡 管理者モード
          </span>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? "ログアウト中..." : "ログアウト"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openLoginModal}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          🔑 管理者
        </button>
      )}

      {loginModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-login-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h2 id="admin-login-title" className="text-lg font-semibold text-slate-900">
              管理者ログイン
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              タスク・プロジェクトの編集/削除、部員の追加/削除は管理者のみ行えます。
            </p>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="admin-password" className="text-sm font-medium text-slate-700">
                  パスワード
                </label>
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              ) : null}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitting || password.length === 0}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "確認中..." : "ログイン"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
