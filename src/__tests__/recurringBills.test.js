import { nextRecurringDate } from "../utils";

describe("nextRecurringDate", () => {
  test("weekly adds exactly 7 days", () => {
    expect(nextRecurringDate("2026-09-07", "weekly")).toBe("2026-09-14");
  });

  test("monthly moves to the same day next month", () => {
    expect(nextRecurringDate("2026-09-15", "monthly")).toBe("2026-10-15");
  });

  test("monthly from the 31st lands on the last day of a shorter month", () => {
    // 2026 is not a leap year -- Feb has 28 days.
    expect(nextRecurringDate("2026-01-31", "monthly")).toBe("2026-02-28");
  });

  test("monthly from the 31st in a leap year lands on Feb 29", () => {
    expect(nextRecurringDate("2028-01-31", "monthly")).toBe("2028-02-29");
  });

  test("monthly correctly rolls over into the next year", () => {
    expect(nextRecurringDate("2026-12-31", "monthly")).toBe("2027-01-31");
  });

  test("an unrecognized/missing frequency returns the date unchanged", () => {
    expect(nextRecurringDate("2026-09-07", null)).toBe("2026-09-07");
    expect(nextRecurringDate("2026-09-07", undefined)).toBe("2026-09-07");
  });
});
