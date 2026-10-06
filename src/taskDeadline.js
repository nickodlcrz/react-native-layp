// Deadlines use local time. Date-only tasks are due at 11:59 PM.
export function taskDeadline(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || (time != null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = (time || "23:59").split(":").map(Number);
  const value = new Date(y, m - 1, d, h, min);
  return value.getFullYear() === y && value.getMonth() === m - 1 && value.getDate() === d ? value.getTime() : null;
}

export function taskCountdown(date, time, now = Date.now()) {
  const deadline = taskDeadline(date, time);
  if (deadline == null) return "";
  const delta = deadline - now;
  if (delta === 0) return "Due now";
  const total = Math.ceil(Math.abs(delta) / 60000);
  const hours = Math.floor(total / 60), minutes = total % 60;
  const duration = hours ? `${hours}hr${hours === 1 ? "" : "s"} and ${minutes}min${minutes === 1 ? "" : "s"}` : `${minutes}min${minutes === 1 ? "" : "s"}`;
  return delta > 0 ? `${duration} until the due date` : `Overdue by ${duration}`;
}
