const normalize = (value) => String(value || "").trim().toLowerCase();

export function shouldCreateTask(item, existingTask, now = Date.now(), relevanceDays = 90) {
  if (existingTask) return true;
  if (item.type === "pr" && item.isDraft) return false;
  if (normalize(item.state) !== "open" || !item.updatedAt) return false;
  const updatedAt = Date.parse(item.updatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt <= relevanceDays * 24 * 60 * 60 * 1000;
}
