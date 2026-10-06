import { applyClassSuspends, pendingToReminders } from "../widgetSummary";

import { requireNativeModule } from "expo-modules-core";
// Isolate the real bridge with a controlled native module, not a replacement bridge.
jest.mock("expo-modules-core", () => ({ requireNativeModule: jest.fn(() => ({ getPending: jest.fn() })) }));
import { getPendingWidgetItems } from "../../modules/layp-widget";

it("passes native class cancellations and reminder drafts across the bridge", async () => {
  const native = requireNativeModule.mock.results[requireNativeModule.mock.calls.findIndex(([name]) => name === "LaypWidget")].value;
  const classSuspends = [{ id: "cancel", entryId: "entry", date: "2026-10-07" }];
  const newReminders = [{ id: "reminder", text: "Check the meter" }];
  native.getPending.mockResolvedValue(JSON.stringify({ classSuspends, newReminders }));
  expect(await getPendingWidgetItems()).toMatchObject({ classSuspends, newReminders, expenses: [], newTasks: [] });
});

it("class suspension replay updates the same state School uses without duplicates", () => {
  const pending = [{ entryId: "class1", date: "2026-10-07" }, { entryId: "bad", date: "tomorrow" }];
  const first = applyClassSuspends([], pending);
  expect(first).toEqual([{ entryId: "class1", date: "2026-10-07" }]);
  expect(applyClassSuspends(first, pending)).toEqual(first);
  expect(first.some((c) => c.date === "2026-10-07" && c.entryId === "class1")).toBe(true);
});

it("preserves dated general reminders, tags and both delivery modes", () => {
  const [reminder] = pendingToReminders([{ id: "r", text: "  Take medicine  ", tags: ["health", "health", " "], remindMode: "both", scheduleKind: "time", remindDate: "2026-10-12", remindTime: "08:15", remindUntil: "2026-10-20", createdAt: 10 }]);
  expect(reminder).toMatchObject({ text: "Take medicine", tags: ["health"], remindMode: "both", remindDate: "2026-10-12", remindTime: "08:15", remindUntil: null, done: false, popupFired: false });
});

it("supports daily stop dates, custom intervals and popup-only always", () => {
  const reminders = pendingToReminders([
    { id: "daily", text: "Water", remindMode: "notification", remindTime: "09:00", remindUntil: "2026-12-31" },
    { id: "interval", text: "Stretch", remindMode: "both", scheduleKind: "interval", remindInterval: { frequency: "custom", customHours: .5 } },
    { id: "popup", text: "Remember", remindMode: "popup", scheduleKind: "interval", remindInterval: { frequency: "always" } },
  ]);
  expect(reminders[0].remindUntil).toBe("2026-12-31");
  expect(reminders[1]).toMatchObject({ remindDate: null, remindTime: null, remindInterval: { frequency: "custom", customHours: .5 } });
  expect(reminders[2].remindInterval.frequency).toBe("always");
});

it("reminder capture is replay-safe and guards unsupported notification frequencies", () => {
  const drafts = [{ id: "a", text: "Note", remindMode: "none" }, { id: "a", text: "Duplicate" }, { id: "blank", text: " " }, { id: "b", text: "Bad interval", remindMode: "notification", scheduleKind: "interval", remindInterval: { frequency: "always" } }];
  const reminders = pendingToReminders(drafts);
  expect(reminders).toHaveLength(2);
  expect(reminders[0]).toMatchObject({ remindTime: null, remindInterval: null });
  expect(reminders[1].remindInterval.frequency).toBe("1h");
  expect(pendingToReminders(drafts, { existingIds: new Set(["a", "b"]) })).toEqual([]);
});
