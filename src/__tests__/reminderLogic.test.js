import { isScheduledPopupDue, isIntervalPopupDue, describeSchedule } from "../reminderLogic";

const past = "2000-01-01";
const future = "2999-01-01";

describe("remindMode 'both' still triggers the in-app popup", () => {
  test("dated item is due once its moment has passed, for popup and both", () => {
    for (const remindMode of ["popup", "both"]) {
      expect(isScheduledPopupDue({ remindMode, remindDate: past, remindTime: "09:00" })).toBe(true);
    }
  });

  test("notification-only items never produce a popup", () => {
    expect(isScheduledPopupDue({ remindMode: "notification", remindDate: past, remindTime: "09:00" })).toBe(false);
    expect(isIntervalPopupDue({ remindMode: "notification", scheduleKind: "interval", remindInterval: { frequency: "1h" } })).toBe(false);
  });

  test("a future dated item is not due yet", () => {
    expect(isScheduledPopupDue({ remindMode: "both", remindDate: future, remindTime: "09:00" })).toBe(false);
  });

  test("a popup that already fired is not due again", () => {
    expect(isScheduledPopupDue({ remindMode: "both", remindDate: past, remindTime: "09:00", popupFired: true })).toBe(false);
  });

  test("interval item with 'both' is due when never shown, and not right after being shown", () => {
    const base = { remindMode: "both", scheduleKind: "interval", remindInterval: { frequency: "1h" } };
    expect(isIntervalPopupDue(base)).toBe(true);
    expect(isIntervalPopupDue({ ...base, lastPopupShownAt: Date.now() })).toBe(false);
    expect(isIntervalPopupDue({ ...base, lastPopupShownAt: Date.now() - 2 * 3600 * 1000 })).toBe(true);
  });

  test("done items are never due", () => {
    expect(isScheduledPopupDue({ remindMode: "both", remindDate: past, remindTime: "09:00", done: true })).toBe(false);
  });

  test("describeSchedule handles interval and dated items", () => {
    expect(describeSchedule({ scheduleKind: "interval", remindInterval: { frequency: "3h" } })).toBe("Every 3 hours");
    expect(describeSchedule({ remindDate: "2026-10-01", remindTime: "08:00" })).toBe("2026-10-01 08:00");
  });
});
