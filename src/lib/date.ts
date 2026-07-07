function todayIsoDate(): string {
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
