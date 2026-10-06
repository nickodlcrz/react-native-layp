import { normalizeWidgetPrefs, toggleKind, ALL_EVENT_KINDS, DEFAULT_WIDGET_PREFS } from "../widgetPrefsLogic";
import { buildWidgetEvents, EVENT_KINDS } from "../widgetEvents";

describe("widget prefs", () => {
  test("default shows every kind on both widgets", () => {
    expect(DEFAULT_WIDGET_PREFS.calendarKinds).toEqual(ALL_EVENT_KINDS);
    expect(DEFAULT_WIDGET_PREFS.upcomingKinds).toEqual(ALL_EVENT_KINDS);
    expect(ALL_EVENT_KINDS).toEqual(EVENT_KINDS.map((k) => k.id));
  });

  test("normalize keeps known kinds in a stable order and drops junk", () => {
    const p = normalizeWidgetPrefs({ calendarKinds: ["monthsary", "bogus", "school"], upcomingKinds: "nope" });
    expect(p.calendarKinds).toEqual(["school", "monthsary"]);
    expect(p.upcomingKinds).toEqual(ALL_EVENT_KINDS);
    expect(normalizeWidgetPrefs(null)).toEqual(DEFAULT_WIDGET_PREFS);
  });

  test("an empty list stays empty (the person turned everything off)", () => {
    expect(normalizeWidgetPrefs({ calendarKinds: [], upcomingKinds: [] })).toEqual({ calendarKinds: [], upcomingKinds: [] });
  });

  test("toggleKind switches one kind on or off", () => {
    expect(toggleKind(["school", "bill"], "bill")).toEqual(["school"]);
    expect(toggleKind(["school"], "bill")).toEqual(["school", "bill"]);
  });
});

describe("buildWidgetEvents kinds filter", () => {
  const today = "2026-10-03";
  const input = {
    todos: [{ id: "t", title: "Report", dueDate: "2026-10-05", category: "school" }, { id: "u", title: "Laundry", dueDate: "2026-10-05" }],
    bills: [{ id: "b", name: "Internet", amount: 1, dueDate: "2026-10-06" }],
    gfDates: [{ id: "g", label: "Anniversary", date: "10-08", kind: "anniversary" }],
    today,
  };

  test("only the chosen kinds come through", () => {
    expect(buildWidgetEvents({ ...input, kinds: ["school", "anniversary"] }).map((e) => e.kind)).toEqual(["school", "anniversary"]);
    expect(buildWidgetEvents({ ...input, kinds: [] })).toEqual([]);
  });

  test("no filter (or null) means everything", () => {
    expect(buildWidgetEvents(input)).toHaveLength(4);
    expect(buildWidgetEvents({ ...input, kinds: null })).toHaveLength(4);
  });

  test("the limit applies after filtering", () => {
    expect(buildWidgetEvents({ ...input, kinds: ["task", "bill"], limit: 1 })).toHaveLength(1);
  });
});
