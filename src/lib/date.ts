export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "done") {
    return false;
  }
  return dueDate < todayIsoDate();
}

export function formatDueDate(dueDate: string | null): string {
  if (!dueDate) {
    return "期限なし";
  }
  const [year, month, day] = dueDate.split("-");
  return `${year}/${month}/${day}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formats an ISO timestamp as "MM/DD HH:mm" in the local timezone. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Formats an ISO timestamp as a short relative time ("たった今" / "5分前" / ...)
 * for recent activity, falling back to an absolute "MM/DD HH:mm" once it's
 * more than a day old so old history stays unambiguous.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 0) return formatDateTime(iso);
  if (diffSec < 60) return "たった今";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  return formatDateTime(iso);
}
