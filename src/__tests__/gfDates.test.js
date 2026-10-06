import { occurrencesBetween, nextOccurrence, daysUntilEntry, badgesFor, entryRepeat, entryKind, addDaysISO, daysBetween, ordinal } from "../gfDates";

const yearly = { date: "11-14" };
const monthly = { date: "03-15", repeat: "monthly" };

describe("gf date repeats", () => {
  test("old entries (no repeat/kind) are yearly, plain dates", () => {
    expect(entryRepeat(yearly)).toBe("yearly");
    expect(entryKind(yearly)).toBe("date");
    expect(badgesFor(yearly)).toEqual([]);
  });

  test("badges: anniversary and monthly", () => {
    expect(badgesFor({ date: "02-02", kind: "anniversary" })).toEqual(["Anniversary"]);
    expect(badgesFor(monthly)).toEqual(["Every month"]);
    expect(badgesFor({ date: "02-02", kind: "anniversary", repeat: "monthly" })).toEqual(["Anniversary", "Every month"]);
  });

  test("yearly: next occurrence is this year if still ahead, else next year; today counts", () => {
    expect(nextOccurrence(yearly, "2026-10-03")).toBe("2026-11-14");
    expect(nextOccurrence(yearly, "2026-11-14")).toBe("2026-11-14");
    expect(nextOccurrence(yearly, "2026-11-15")).toBe("2027-11-14");
  });

  test("monthly: same day every month, rolling over the year", () => {
    expect(nextOccurrence(monthly, "2026-10-03")).toBe("2026-10-15");
    expect(nextOccurrence(monthly, "2026-10-16")).toBe("2026-11-15");
    expect(nextOccurrence(monthly, "2026-12-20")).toBe("2027-01-15");
    expect(occurrencesBetween(monthly, "2026-10-01", "2027-01-31")).toEqual(["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15"]);
  });

  test("monthly on the 31st lands on each month's last day", () => {
    const m31 = { date: "01-31", repeat: "monthly" };
    expect(occurrencesBetween(m31, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  test("Feb 29 yearly uses Feb 28 in common years and Feb 29 in leap years", () => {
    const leap = { date: "02-29" };
    expect(occurrencesBetween(leap, "2027-01-01", "2027-12-31")).toEqual(["2027-02-28"]);
    expect(occurrencesBetween(leap, "2028-01-01", "2028-12-31")).toEqual(["2028-02-29"]);
  });

  test("range limits are inclusive and exclude what falls outside", () => {
    expect(occurrencesBetween(monthly, "2026-10-16", "2026-11-14")).toEqual([]);
    expect(occurrencesBetween(monthly, "2026-10-15", "2026-11-15")).toEqual(["2026-10-15", "2026-11-15"]);
  });

  test("daysUntilEntry and date math", () => {
    expect(daysUntilEntry(monthly, "2026-10-10")).toBe(5);
    expect(daysUntilEntry(monthly, "2026-10-15")).toBe(0);
    expect(daysBetween("2026-10-03", "2026-10-10")).toBe(7);
    expect(addDaysISO("2026-12-30", 3)).toBe("2027-01-02");
  });

  test("malformed entries produce nothing", () => {
    expect(occurrencesBetween({ date: "nope" }, "2026-01-01", "2026-12-31")).toEqual([]);
    expect(nextOccurrence({}, "2026-01-01")).toBeNull();
    expect(daysUntilEntry({}, "2026-01-01")).toBe(Infinity);
  });
});

describe("ordinal", () => {
  test("suffixes, including the 11th-13th exceptions", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "30th", "31st"]);
  });
});
