import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsAnchored,
  cycleStart,
  daysInMonth,
  diffDays,
  formatDateIN,
  isValidDate,
  todayInTimeZone,
} from "@/lib/dates";

describe("addMonthsAnchored", () => {
  it("adds calendar months, not 30-day blocks", () => {
    expect(addMonthsAnchored("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonthsAnchored("2026-01-15", 3)).toBe("2026-04-15");
    expect(addMonthsAnchored("2026-01-15", 12)).toBe("2027-01-15");
  });

  it("clamps month-end anchors without drifting (Jan 31 → Feb → Mar 31)", () => {
    expect(cycleStart("2026-01-31", 1, 0)).toBe("2026-01-31");
    expect(cycleStart("2026-01-31", 1, 1)).toBe("2026-02-28");
    expect(cycleStart("2026-01-31", 1, 2)).toBe("2026-03-31");
    expect(cycleStart("2026-01-31", 1, 3)).toBe("2026-04-30");
    expect(cycleStart("2026-01-31", 1, 4)).toBe("2026-05-31");
  });

  it("handles leap years for month-end anchors", () => {
    expect(addMonthsAnchored("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsAnchored("2027-01-31", 1)).toBe("2027-02-28");
  });

  it("is deterministic for Feb 29 anchors", () => {
    expect(addMonthsAnchored("2028-02-29", 12)).toBe("2029-02-28");
    expect(addMonthsAnchored("2028-02-29", 24)).toBe("2030-02-28");
    expect(addMonthsAnchored("2028-02-29", 48)).toBe("2032-02-29");
    // monthly cycle from Feb 29 returns to the 29th when the month allows it
    expect(cycleStart("2028-02-29", 1, 1)).toBe("2028-03-29");
  });

  it("crosses year boundaries", () => {
    expect(addMonthsAnchored("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsAnchored("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("quarterly month-end anchors", () => {
    expect(cycleStart("2026-11-30", 3, 1)).toBe("2027-02-28");
    expect(cycleStart("2026-11-30", 3, 2)).toBe("2027-05-30");
  });
});

describe("day arithmetic", () => {
  it("adds and diffs days across month/year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-05", -5)).toBe("2026-02-28");
    expect(diffDays("2026-01-01", "2027-01-01")).toBe(365);
    expect(diffDays("2026-03-10", "2026-03-05")).toBe(-5);
  });

  it("validates dates", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe("time zone handling", () => {
  it("uses Asia/Kolkata calendar day, not UTC", () => {
    // 20:00 UTC on 31 Mar is already 01:30 on 1 Apr in IST
    expect(todayInTimeZone("Asia/Kolkata", new Date("2026-03-31T20:00:00Z"))).toBe("2026-04-01");
    expect(todayInTimeZone("UTC", new Date("2026-03-31T20:00:00Z"))).toBe("2026-03-31");
    // 03:30 UTC == 09:00 IST same day (cron time)
    expect(todayInTimeZone("Asia/Kolkata", new Date("2026-03-31T03:30:00Z"))).toBe("2026-03-31");
  });

  it("formats for Indian readers", () => {
    expect(formatDateIN("2026-03-05")).toBe("5 Mar 2026");
  });
});
