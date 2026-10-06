import { taskCountdown, taskDeadline } from "../taskDeadline";

const now = new Date(2026, 9, 7, 10, 0).getTime();

test("uses the task's local due time down to hours and minutes", () => {
  expect(taskCountdown("2026-10-07", "13:30", now)).toBe("3hrs and 30mins until the due date");
});
test("date-only deadlines use 11:59 PM", () => {
  expect(taskCountdown("2026-10-07", null, now)).toBe("13hrs and 59mins until the due date");
});
test("covers midnight without dropping the next day's hours", () => {
  expect(taskCountdown("2026-10-08", "01:15", new Date(2026, 9, 7, 23, 45).getTime())).toBe("1hr and 30mins until the due date");
});
test("reports due now and same-day overdue tasks", () => {
  expect(taskCountdown("2026-10-07", "10:00", now)).toBe("Due now");
  expect(taskCountdown("2026-10-07", "09:30", now)).toBe("Overdue by 30mins");
});
test("rounds future partial minutes up", () => {
  expect(taskCountdown("2026-10-07", "10:01", now + 30000)).toBe("1min until the due date");
});
test.each([[null, null], ["2026-02-30", "10:00"], ["2026-13-07", "10:00"], ["2026-10-07", "24:00"], ["2026-10-07", "08:99"]])("invalid deadline %s / %s has no timer", (date, time) => {
  expect(taskDeadline(date, time)).toBeNull();
  expect(taskCountdown(date, time, now)).toBe("");
});
