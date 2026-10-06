import { buildWidgetEvents } from "../widgetEvents";

const today = "2026-10-03";

describe("buildWidgetEvents", () => {
  const base = {
    todos: [
      { id: "t1", title: "Circuits report", dueDate: "2026-10-05", category: "school" },
      { id: "t2", title: "Laundry", dueDate: "2026-10-04" },
      { id: "t3", title: "Done already", dueDate: "2026-10-04", completed: true },
      { id: "t4", title: "Overdue", dueDate: "2026-10-01" },
      { id: "t5", title: "No date" },
    ],
    bills: [
      { id: "b1", name: "Internet", amount: 1299, dueDate: "2026-10-10" },
      { id: "b2", name: "Paid bill", amount: 5, dueDate: "2026-10-10", paid: true },
    ],
    loans: [
      { id: "l1", type: "lent", person: "Ana", dueDate: "2026-10-20" },
      { id: "l2", type: "borrowed", person: "Ben", dueDate: "2026-10-21", settled: true },
    ],
    reminders: [{ id: "r1", text: "Call mom", remindDate: "2026-10-03", done: false }],
    gfDates: [
      { id: "g1", label: "Monthsary", date: "03-15", repeat: "monthly" },
      { id: "g2", label: "Anniversary", date: "11-14", kind: "anniversary" },
      { id: "g3", label: "Her birthday", date: "12-25" },
    ],
    today,
  };

  test("includes open, upcoming items only and tags their kind", () => {
    const events = buildWidgetEvents(base);
    const byTitle = (t) => events.find((e) => e.title === t);
    expect(byTitle("Circuits report").kind).toBe("school");
    expect(byTitle("Laundry").kind).toBe("task");
    expect(byTitle("Internet")).toMatchObject({ kind: "bill", amount: 1299 });
    expect(byTitle("Collect from Ana").kind).toBe("loan");
    expect(byTitle("Call mom").kind).toBe("reminder");
    expect(byTitle("Done already")).toBeUndefined();
    expect(byTitle("Overdue")).toBeUndefined();
    expect(byTitle("No date")).toBeUndefined();
    expect(byTitle("Paid bill")).toBeUndefined();
    expect(events.find((e) => e.title.includes("Ben"))).toBeUndefined();
  });

  test("gf dates expand into dated occurrences with the right kind", () => {
    const events = buildWidgetEvents(base);
    const monthsaries = events.filter((e) => e.kind === "monthsary").map((e) => e.date);
    expect(monthsaries).toEqual(["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15"]);
    expect(events.find((e) => e.kind === "anniversary").date).toBe("2026-11-14");
    expect(events.find((e) => e.kind === "date").date).toBe("2026-12-25");
  });

  test("sorted by date, then by kind priority", () => {
    const events = buildWidgetEvents(base);
    const dates = events.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
    expect(events[0]).toMatchObject({ date: "2026-10-03", title: "Call mom" });
  });

  test("respects the horizon and the limit", () => {
    expect(buildWidgetEvents({ ...base, horizonDays: 5 }).every((e) => e.date <= "2026-10-08")).toBe(true);
    expect(buildWidgetEvents({ ...base, limit: 3 })).toHaveLength(3);
  });
});
