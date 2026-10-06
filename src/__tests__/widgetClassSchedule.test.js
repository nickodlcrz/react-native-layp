import { buildWidgetSummary } from "../widgetSummary";

const schedule = {
  academicPeriods: [{ id: "term", status: "active" }],
  subjects: [{ id: "wed", periodId: "term", code: "EE12", room: "Lab 2" }, { id: "thu", periodId: "term", code: "EE13" }, { id: "old", periodId: "archived", code: "OLD" }],
  scheduleEntries: [{ id: "w", subjectId: "wed", days: [4], startTime: "23:00", endTime: "23:59" }, { id: "t", subjectId: "thu", days: [5], startTime: "08:00", endTime: "09:00" }, { id: "o", subjectId: "old", days: [4], startTime: "08:00", endTime: "09:00" }],
};

afterEach(() => jest.useRealTimers());

test("uses the supplied local date's weekday even when the clock has crossed midnight", () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 8, 8, 0));
  const summary = buildWidgetSummary({ ...schedule, today: "2026-10-07" });
  expect(summary.classes[0]).toMatchObject({ code: "EE12", dayLabel: "Today" });
});

test("sends the active weekly schedule so Android can select the day while the app is closed", () => {
  const summary = buildWidgetSummary({ ...schedule, today: "2026-10-07" });
  expect(summary.classSchedule).toHaveLength(2);
  expect(summary.classSchedule.find((c) => c.code === "EE12")).toMatchObject({ days: [4], startMin: 1380, endMin: 1439 });
  expect(summary.classSchedule.find((c) => c.code === "EE13")).toMatchObject({ days: [5], startMin: 480, endMin: 540 });
});

test("date-specific cancellations survive in the native snapshot without removing the weekly class", () => {
  const summary = buildWidgetSummary({ ...schedule, today: "2026-10-07", cancelledClasses: [{ entryId: "w", date: "2026-10-07" }] });
  expect(summary.cancelledClassKeys).toContain("2026-10-07|w");
  expect(summary.classSchedule.map((c) => c.entryId)).toContain("w");
});
