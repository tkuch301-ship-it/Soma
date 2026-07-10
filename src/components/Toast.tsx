"use client";

interface ToastProps {
  message: string | null;
  variant?: "success" | "error";
}

/** Small auto-dismissing status message, fixed to the bottom-right of the viewport. */
export default function Toast({ message, variant = "success" }: ToastProps) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-[60] max-w-xs rounded-md px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
        variant === "error" ? "bg-red-600" : "bg-slate-900"
      }`}
    >
      {message}
    </div>
  );
}
