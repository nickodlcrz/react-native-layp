import { buildWidgetSummary, pendingToExpenses, topLabels, DEFAULT_WIDGET_LABELS } from "../widgetSummary";

const today = "2026-10-02";
const exp = (over) => ({ id: Math.random().toString(36), amount: 10, date: today, label: "", ...over });

describe("topLabels", () => {
  test("no history falls back to the defaults", () => {
    expect(topLabels([], today)).toEqual(DEFAULT_WIDGET_LABELS);
  });

  test("most-used labels come first, then defaults fill the rest", () => {
    const expenses = [
      exp({ label: "Coffee" }), exp({ label: "Coffee" }), exp({ label: "Coffee" }),
      exp({ label: "Transportation" }), exp({ label: "Transportation" }),
      exp({ label: "Gifts" }),
    ];
    expect(topLabels(expenses, today)).toEqual(["Coffee", "Transportation", "Gifts", "Food"]);
  });

  test("matches labels ignoring case and shows the latest casing", () => {
    const expenses = [exp({ label: "food", date: "2026-09-20" }), exp({ label: "Food", date: "2026-09-25" })];
    expect(topLabels(expenses, today)[0]).toBe("Food");
    expect(topLabels(expenses, today).filter((l) => l.toLowerCase() === "food")).toHaveLength(1);
  });

  test("ignores unlabeled, future and older-than-60-day expenses", () => {
    const expenses = [
      exp({ label: "" }),
      exp({ label: "Old", date: "2026-07-01" }),
      exp({ label: "Future", date: "2026-10-09" }),
    ];
    expect(topLabels(expenses, today)).toEqual(DEFAULT_WIDGET_LABELS);
  });

  test("respects the limit", () => {
    expect(topLabels([], today, 2)).toEqual(["Food", "Transportation"]);
  });
});

describe("buildWidgetSummary", () => {
  const splits = [{ id: "s0", label: "Needs", percent: 50 }];
  const accounts = [{ id: "ecash", label: "E-cash" }, { id: "physical", label: "Physical" }];

  test("totals only today's expenses and reports balances", () => {
    const s = buildWidgetSummary({
      expenses: [exp({ amount: 120.5 }), exp({ amount: 30 }), exp({ amount: 999, date: "2026-10-01" })],
      splits, accounts, balanceOf: (id) => (id === "ecash" ? 500.456 : 20), hidden: true, today,
    });
    expect(s.date).toBe(today);
    expect(s.todaySpent).toBe(150.5);
    expect(s.todayCount).toBe(2);
    expect(s.hidden).toBe(true);
    expect(s.splits).toEqual([{ id: "s0", label: "Needs" }]);
    expect(s.accounts).toEqual([
      { id: "ecash", label: "E-cash", balance: 500.46 },
      { id: "physical", label: "Physical", balance: 20 },
    ]);
    expect(s.labels).toHaveLength(4);
  });

  test("empty day is zero", () => {
    const s = buildWidgetSummary({ expenses: [], splits, accounts, today });
    expect(s.todaySpent).toBe(0);
    expect(s.todayCount).toBe(0);
    expect(s.hidden).toBe(false);
  });
});

describe("pendingToExpenses", () => {
  const splits = [{ id: "s0" }, { id: "s1" }];
  const accounts = [{ id: "ecash" }, { id: "physical" }];
  const queued = (over) => ({ id: "w1", amount: 85, name: "Lunch", label: "Food", splitId: "s1", account: "physical", date: today, createdAt: 123, ...over });

  test("turns a queued entry into an expense", () => {
    const { expenses, ackIds } = pendingToExpenses([queued()], { splits, accounts, today });
    expect(expenses).toEqual([{ id: "w1", name: "Lunch", label: "Food", amount: 85, splitId: "s1", account: "physical", date: today, createdAt: 123 }]);
    expect(ackIds).toEqual(["w1"]);
  });

  test("skips ids already in LAYP but still acknowledges them", () => {
    const { expenses, ackIds } = pendingToExpenses([queued()], { splits, accounts, existingIds: new Set(["w1"]), today });
    expect(expenses).toEqual([]);
    expect(ackIds).toEqual(["w1"]);
  });

  test("a deleted category or account falls back to the first one", () => {
    const { expenses } = pendingToExpenses([queued({ splitId: "gone", account: "gone" })], { splits, accounts, today });
    expect(expenses[0].splitId).toBe("s0");
    expect(expenses[0].account).toBe("ecash");
  });

  test("an empty name falls back to the label, then to a generic name", () => {
    const a = pendingToExpenses([queued({ name: "  " })], { splits, accounts, today }).expenses[0];
    expect(a.name).toBe("Food");
    const b = pendingToExpenses([queued({ name: "", label: "" })], { splits, accounts, today }).expenses[0];
    expect(b.name).toBe("Quick expense");
  });

  test("drops invalid amounts and duplicate ids within a batch, but acknowledges them", () => {
    const { expenses, ackIds } = pendingToExpenses(
      [queued({ id: "a", amount: 0 }), queued({ id: "b", amount: "x" }), queued({ id: "c" }), queued({ id: "c" })],
      { splits, accounts, today }
    );
    expect(expenses.map((e) => e.id)).toEqual(["c"]);
    expect(ackIds).toEqual(["a", "b", "c", "c"]);
  });

  test("a bad date falls back to today and amounts are rounded to cents", () => {
    const e = pendingToExpenses([queued({ date: "nope", amount: 10.005 })], { splits, accounts, today }).expenses[0];
    expect(e.date).toBe(today);
    expect(e.amount).toBe(10.01);
  });
});

import { pendingToMoney, pendingToTodos, applyTaskOps } from "../widgetSummary";

describe("pendingToExpenses never spends past an account's balance", () => {
  const splits = [{ id: "s0" }];
  const accounts = [{ id: "ecash" }, { id: "physical" }];
  const q = (over) => ({ id: "x", amount: 100, name: "Lunch", label: "Food", splitId: "s0", account: "ecash", date: today, createdAt: 1, ...over });

  test("an expense bigger than what's left is rejected, and the queue still drains", () => {
    const { expenses, rejected, ackIds } = pendingToExpenses([q({ id: "a", amount: 150 })], { splits, accounts, today, balances: { ecash: 100, physical: 0 } });
    expect(expenses).toEqual([]);
    expect(rejected).toEqual([{ id: "a", name: "Lunch", amount: 150, account: "ecash", available: 100 }]);
    expect(ackIds).toEqual(["a"]);
  });

  test("balance is used up across the batch, in the order they were logged", () => {
    const { expenses, rejected } = pendingToExpenses(
      [q({ id: "b", amount: 60, createdAt: 2 }), q({ id: "a", amount: 60, createdAt: 1 })],
      { splits, accounts, today, balances: { ecash: 100, physical: 0 } }
    );
    expect(expenses.map((e) => e.id)).toEqual(["a"]);
    expect(rejected.map((r) => r.id)).toEqual(["b"]);
  });

  test("spending exactly the balance is allowed", () => {
    const { expenses } = pendingToExpenses([q({ amount: 100 })], { splits, accounts, today, balances: { ecash: 100 } });
    expect(expenses).toHaveLength(1);
  });

  test("money received in the same batch counts toward the balance", () => {
    const { expenses } = pendingToExpenses([q({ amount: 150 })], { splits, accounts, today, balances: { ecash: 100 }, moneyAdded: { ecash: 50 } });
    expect(expenses).toHaveLength(1);
  });

  test("without balances nothing is blocked", () => {
    expect(pendingToExpenses([q({ amount: 99999 })], { splits, accounts, today }).expenses).toHaveLength(1);
  });
});

describe("pendingToMoney", () => {
  const accounts = [{ id: "ecash" }, { id: "physical" }];
  const incomeCategories = [{ id: "allowance" }, { id: "gift" }];
  const m = (over) => ({ id: "m1", amount: 500, note: "Allowance", category: "allowance", account: "physical", date: today, createdAt: 5, ...over });

  test("becomes a moneyLog entry", () => {
    const { entries, ackIds } = pendingToMoney([m()], { accounts, incomeCategories, today });
    expect(entries).toEqual([{ id: "m1", amount: 500, note: "Allowance", category: "allowance", account: "physical", date: today, createdAt: 5 }]);
    expect(ackIds).toEqual(["m1"]);
  });

  test("unknown category/account fall back; duplicates and bad amounts are dropped but acknowledged", () => {
    const { entries, ackIds } = pendingToMoney(
      [m({ id: "a", category: "zzz", account: "zzz" }), m({ id: "b", amount: 0 }), m({ id: "c" }), m({ id: "c" })],
      { accounts, incomeCategories, existingIds: new Set(["c"]), today }
    );
    expect(entries).toEqual([expect.objectContaining({ id: "a", category: "other", account: "ecash" })]);
    expect(ackIds).toEqual(["a", "b", "c", "c"]);
  });
});

describe("applyTaskOps", () => {
  const todos = [
    { id: "t1", title: "A", status: "not_started" },
    { id: "t2", title: "B", status: "to_pass" },
    { id: "t3", title: "C", status: "wip", completed: true },
  ];

  test("sets a status, optionally only from an expected one", () => {
    const r = applyTaskOps(todos, [
      { id: "o1", taskId: "t1", status: "wip", onlyIf: "not_started", at: 1 },
      { id: "o2", taskId: "t2", status: "wip", onlyIf: "not_started", at: 2 },
    ]);
    expect(r.todos.find((t) => t.id === "t1").status).toBe("wip");
    expect(r.todos.find((t) => t.id === "t2").status).toBe("to_pass");
    expect(r.ackIds).toEqual(["o1", "o2"]);
  });

  test("completes a task and reports it so reminders can be cancelled", () => {
    const r = applyTaskOps(todos, [{ id: "o1", taskId: "t2", complete: true, at: 1700000000000 }]);
    const t = r.todos.find((x) => x.id === "t2");
    expect(t.completed).toBe(true);
    expect(t.completedAt).toBe(new Date(1700000000000).toISOString());
    expect(r.completed.map((x) => x.id)).toEqual(["t2"]);
  });

  test("ops apply in time order and are safe to replay", () => {
    const ops = [
      { id: "b", taskId: "t1", status: "to_pass", at: 2 },
      { id: "a", taskId: "t1", status: "wip", at: 1 },
    ];
    const once = applyTaskOps(todos, ops);
    expect(once.todos.find((t) => t.id === "t1").status).toBe("to_pass");
    const twice = applyTaskOps(once.todos, ops);
    expect(twice.todos.find((t) => t.id === "t1").status).toBe("to_pass");
  });

  test("missing, already-completed tasks and unknown statuses are ignored but acknowledged", () => {
    const r = applyTaskOps(todos, [
      { id: "o1", taskId: "gone", status: "wip", at: 1 },
      { id: "o2", taskId: "t3", complete: true, at: 2 },
      { id: "o3", taskId: "t1", status: "bogus", at: 3 },
    ]);
    expect(r.completed).toEqual([]);
    expect(r.todos.find((t) => t.id === "t1").status).toBe("not_started");
    expect(r.ackIds).toEqual(["o1", "o2", "o3"]);
  });

  test("does not mutate its input", () => {
    const copy = JSON.stringify(todos);
    applyTaskOps(todos, [{ id: "o1", taskId: "t1", status: "wip", at: 1 }]);
    expect(JSON.stringify(todos)).toBe(copy);
  });
});

describe("pendingToTodos", () => {
  const q = (over) => ({ id: "n1", title: "  Read chapter 4 ", category: "school", dueDate: "2026-10-05", createdAt: 9, ...over });

  test("creates a task shaped like the in-app form's, with the form's defaults", () => {
    const { todos, ackIds } = pendingToTodos([q()], { today });
    expect(todos).toEqual([{
      id: "n1", title: "Read chapter 4", description: "", category: "school", status: "not_started", subjectId: null,
      dueDate: "2026-10-05", dueTime: null, alarmEnabled: false, reminderEnabled: true,
      notify: { type: "daily", time: "08:00" }, subtasks: [], completed: false, notificationIds: [],
    }]);
    expect(ackIds).toEqual(["n1"]);
  });

  test("no date stays no date, and a malformed one is dropped", () => {
    expect(pendingToTodos([q({ dueDate: undefined })], { today }).todos[0].dueDate).toBeNull();
    expect(pendingToTodos([q({ dueDate: "soon" })], { today }).todos[0].dueDate).toBeNull();
  });

  test("an unknown category becomes other", () => {
    expect(pendingToTodos([q({ category: "zzz" })], { today }).todos[0].category).toBe("other");
  });

  test("blank titles, ids already in LAYP and duplicate ids are skipped, but all acknowledged", () => {
    const { todos, ackIds } = pendingToTodos(
      [q({ id: "a", title: "   " }), q({ id: "b" }), q({ id: "c" }), q({ id: "c" })],
      { existingIds: new Set(["b"]), today }
    );
    expect(todos.map((t) => t.id)).toEqual(["c"]);
    expect(ackIds).toEqual(["a", "b", "c", "c"]);
  });

  test("a new task can be advanced by a queued tap in the same sync", () => {
    const { todos } = pendingToTodos([q()], { today });
    const r = applyTaskOps(todos, [{ id: "o1", taskId: "n1", status: "wip", at: 1 }]);
    expect(r.todos[0].status).toBe("wip");
  });
});

describe("buildWidgetSummary task details and per-widget events", () => {
  const subjects = [{ id: "s1", code: "EE 301" }];
  const categories = [{ id: "school", label: "School" }, { id: "other", label: "Other" }];
  const todos = [
    { id: "a", title: "Lab report", status: "wip", dueDate: "2026-10-05", category: "school", subjectId: "s1" },
    { id: "b", title: "Buy ink", status: "not_started", category: "other", subjectId: null },
  ];

  test("tasks carry their category label and subject code", () => {
    const s = buildWidgetSummary({ todos, subjects, categories, today });
    expect(s.tasks.find((t) => t.id === "a")).toMatchObject({ categoryLabel: "School", subject: "EE 301" });
    expect(s.tasks.find((t) => t.id === "b")).toMatchObject({ categoryLabel: "Other", subject: "" });
  });

  test("a subject that no longer exists just has no code", () => {
    const s = buildWidgetSummary({ todos: [{ ...todos[0], subjectId: "gone" }], subjects, categories, today });
    expect(s.tasks[0].subject).toBe("");
  });

  test("calendar and upcoming events are passed through separately", () => {
    const s = buildWidgetSummary({ events: [{ date: today, title: "A", kind: "bill" }], upcoming: [{ date: today, title: "B", kind: "task" }], today });
    expect(s.events[0].title).toBe("A");
    expect(s.upcoming[0].title).toBe("B");
  });
});


describe("expanded widget capture", () => {
  test("preserves description, linked subject, reminders and deadline alarm", () => {
    const task = pendingToTodos([{ id: "new", title: "Lab", description: "Read chapter 2", category: "school", subjectId: "ee", dueDate: "2026-10-12", dueTime: "14:30", alarmEnabled: true, reminderEnabled: true, notify: { type: "weekly", weekdays: [2, 4, 2], time: "09:15" } }], { subjects: [{ id: "ee" }] }).todos[0];
    expect(task).toMatchObject({ description: "Read chapter 2", subjectId: "ee", dueTime: "14:30", alarmEnabled: true, notify: { type: "weekly", weekdays: [2, 4], time: "09:15" } });
  });
  test("drops invalid deadlines and cannot arm an undated alarm", () => {
    const task = pendingToTodos([{ id: "n", title: "Undated", dueDate: "2026-02-30", dueTime: "25:00", alarmEnabled: true, subjectId: "gone", reminderEnabled: false, notify: { type: "once", time: "08:00" } }]).todos[0];
    expect(task).toMatchObject({ dueDate: null, dueTime: null, alarmEnabled: false, subjectId: null, reminderEnabled: false, notify: { type: "daily", time: "08:00" } });
  });
  test("scrolling widgets retain more than sixty open tasks", () => {
    const todos = Array.from({ length: 100 }, (_, i) => ({ id: String(i), title: `Task ${i}` }));
    expect(buildWidgetSummary({ todos, today }).tasks).toHaveLength(100);
  });
});

test("widget snapshot preserves due time for the native countdown", () => {
  const snapshot = buildWidgetSummary({ today, todos: [{ id: "timed", title: "Lab report", dueDate: "2026-10-07", dueTime: "13:30" }, { id: "date-only", title: "Reading", dueDate: "2026-10-08" }] });
  expect(snapshot.tasks.find((t) => t.id === "timed")).toMatchObject({ due: "2026-10-07", dueTime: "13:30" });
  expect(snapshot.tasks.find((t) => t.id === "date-only").dueTime).toBeNull();
});
