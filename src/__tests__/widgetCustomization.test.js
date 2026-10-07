import { buildWidgetSummary } from "../widgetSummary";
const input = { today: "2026-10-07", accounts: [{ id: "cash", label: "Cash" }, { id: "bank", label: "Bank" }], balanceOf: () => 100,
  academicPeriods: [{ id: "p", status: "active" }], subjects: [{ id: "s", periodId: "p", code: "EE12" }], scheduleEntries: [{ id: "e", subjectId: "s", days: [4], startTime: "09:00", endTime: "10:00" }],
  todos: [{ id: "school", subjectId: "s", title: "Report", subtasks: [{ done: true }, { done: false }] }, { id: "general", title: "Laundry" }],
};
test("sends subtask progress and validated appearance to native widgets", () => {
  const summary = buildWidgetSummary({ ...input, widgetPrefs: { fontScale: 1.15, opacity: 0.85 } });
  expect(summary.tasks.find((t) => t.id === "school")).toMatchObject({ subtaskCount: 2, subtaskDone: 1 });
  expect(summary).toMatchObject({ fontScale: 1.15, opacity: 0.85, budgetAccountIds: null, visibleSubjectIds: null });
});
test("visibility filters class and school-task displays without removing logging choices", () => {
  const summary = buildWidgetSummary({ ...input, widgetPrefs: { subjectIds: [], accountIds: ["cash"] } });
  expect(summary.classSchedule).toEqual([]);
  expect(summary.tasks.map((t) => t.id)).toEqual(["general"]);
  expect(summary.accounts.map((a) => a.id)).toEqual(["cash", "bank"]);
  expect(summary.subjects).toHaveLength(1);
  expect(summary.budgetAccountIds).toEqual(["cash"]);
});
