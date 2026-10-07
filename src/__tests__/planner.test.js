import { buildWeekPlan, freeClassTime, shiftDate, weekStart } from "../planner";

const data = {
  start: "2026-10-05", periods: [{ id: "term", status: "active" }], subjects: [{ id: "s", periodId: "term", code: "EE12" }],
  entries: [{ id: "e", subjectId: "s", days: [4], startTime: "09:00", endTime: "10:30" }],
  todos: [{ id: "t", title: "Report", dueDate: "2026-10-07", dueTime: "14:00" }, { id: "done", completed: true, dueDate: "2026-10-07" }],
  reminders: [{ id: "r", text: "Call home", remindTime: "18:00", remindUntil: "2026-10-08" }],
};
test("uses Monday weeks, handles Sunday and year boundaries locally", () => {
  expect(weekStart("2026-10-11")).toBe("2026-10-05");
  expect(weekStart("2027-01-01")).toBe("2026-12-28");
  expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
});
test("combines today's local classes, timed deadlines and daily reminders, excluding completed tasks", () => {
  const week = buildWeekPlan(data);
  expect(week[2].items.map((i) => i.kind)).toEqual(["class", "task", "reminder"]);
  expect(week[2].items[1].time).toBe("14:00");
  expect(week[4].items).toEqual([]);
});
test("a cancellation frees only that date's class without losing the weekly schedule", () => {
  const cancelledClasses = [{ date: "2026-10-07", entryId: "e" }];
  const day = buildWeekPlan({ ...data, cancelledClasses })[2];
  expect(day.items[0].cancelled).toBe(true);
  expect(day.free).toEqual([{ startMin: 480, endMin: 1200 }]);
  expect(buildWeekPlan({ ...data, start: "2026-10-12", cancelledClasses })[2].items[0].cancelled).toBe(false);
});
test("merges overlapping classes and clips them to study hours", () => {
  expect(freeClassTime([{ kind: "class", startMin: 420, endMin: 540 }, { kind: "class", startMin: 510, endMin: 600 }, { kind: "class", startMin: 1170, endMin: 1260 }])).toEqual([{ startMin: 600, endMin: 1170 }]);
});
test("flags overlapping classes but ignores cancelled classes", () => {
  const entries = [...data.entries, { id: "overlap", subjectId: "s", days: [4], startTime: "10:00", endTime: "11:00" }];
  expect(buildWeekPlan({ ...data, entries })[2].conflicts).toHaveLength(2);
  expect(buildWeekPlan({ ...data, entries, cancelledClasses: [{ entryId: "overlap", date: "2026-10-07" }] })[2].conflicts).toEqual([]);
});
