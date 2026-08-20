import { describe, expect, it } from "vitest";
import { normalizeTimeText, sameTimeText } from "./time-text";

describe("normalizeTimeText", () => {
  it("takes the start of an am/pm range (the format seen in the real base)", () => {
    expect(normalizeTimeText("8:15am - 9:45am")).toBe("08:15");
    expect(normalizeTimeText("8:15 AM - 9:45 AM")).toBe("08:15");
    expect(normalizeTimeText("9:00am-10:30am")).toBe("09:00");
    expect(normalizeTimeText("12:30pm - 2:00pm")).toBe("12:30");
  });

  it("parses 12-hour times with minutes", () => {
    expect(normalizeTimeText("8:15 AM")).toBe("08:15");
    expect(normalizeTimeText("8:15am")).toBe("08:15");
    expect(normalizeTimeText("1:30 p.m.")).toBe("13:30");
    expect(normalizeTimeText("12:05 PM")).toBe("12:05");
  });

  it("parses 12-hour times without minutes", () => {
    expect(normalizeTimeText("8am")).toBe("08:00");
    expect(normalizeTimeText("8 AM")).toBe("08:00");
    expect(normalizeTimeText("12pm")).toBe("12:00");
    expect(normalizeTimeText("12am")).toBe("00:00");
    expect(normalizeTimeText("1 p.m.")).toBe("13:00");
  });

  it("accepts already-valid HH:MM, zero-padding it", () => {
    expect(normalizeTimeText("08:15")).toBe("08:15");
    expect(normalizeTimeText("8:15")).toBe("08:15");
    expect(normalizeTimeText("13:45")).toBe("13:45");
    expect(normalizeTimeText("  9:00  ")).toBe("09:00");
  });

  it("accepts a period as the minutes separator", () => {
    expect(normalizeTimeText("8.15am")).toBe("08:15");
  });

  it("handles range separators: en dash, em dash, 'to'", () => {
    expect(normalizeTimeText("8:15\u20139:45")).toBe("08:15");
    expect(normalizeTimeText("8:15am \u2014 9:45am")).toBe("08:15");
    expect(normalizeTimeText("9:00 AM to 10:30 AM")).toBe("09:00");
  });

  it("inherits am/pm from the end of a range", () => {
    expect(normalizeTimeText("8 - 9:30am")).toBe("08:00");
    expect(normalizeTimeText("1:30 - 2:30pm")).toBe("13:30");
  });

  it("flips the inherited am/pm when the range crosses noon", () => {
    expect(normalizeTimeText("11 - 1:30pm")).toBe("11:00");
    expect(normalizeTimeText("8:15 - 1:30pm")).toBe("08:15");
    expect(normalizeTimeText("12 - 1pm")).toBe("12:00");
  });

  it("returns null for a bare hour with no am/pm anywhere (ambiguous)", () => {
    expect(normalizeTimeText("8")).toBeNull();
    expect(normalizeTimeText("8 - 9")).toBeNull();
  });

  it("returns null for genuinely unparseable text", () => {
    expect(normalizeTimeText("")).toBeNull();
    expect(normalizeTimeText("   ")).toBeNull();
    expect(normalizeTimeText("TBD")).toBeNull();
    expect(normalizeTimeText("morning assembly")).toBeNull();
    expect(normalizeTimeText("around 8:15am")).toBeNull();
    expect(normalizeTimeText("noon")).toBeNull();
  });

  it("returns null for out-of-range clock values", () => {
    expect(normalizeTimeText("25:00")).toBeNull();
    expect(normalizeTimeText("8:75")).toBeNull();
    expect(normalizeTimeText("13pm")).toBeNull();
    expect(normalizeTimeText("0am")).toBeNull();
  });
});

describe("sameTimeText", () => {
  it("treats a normalized portal answer as equal to Airtable's raw text", () => {
    expect(sameTimeText("8:15am - 9:45am", "08:15")).toBe(true);
    expect(sameTimeText("08:15", "8:15am - 9:45am")).toBe(true);
    expect(sameTimeText("8am", "08:00")).toBe(true);
  });

  it("treats identical raw text as equal even when unparseable", () => {
    expect(sameTimeText("TBD", "TBD")).toBe(true);
    expect(sameTimeText("  TBD ", "TBD")).toBe(true);
    expect(sameTimeText("", "")).toBe(true);
  });

  it("different clock times are not equal", () => {
    expect(sameTimeText("8:15am - 9:45am", "09:00")).toBe(false);
    expect(sameTimeText("08:15", "8:30am")).toBe(false);
  });

  it("unparseable vs parseable is not equal", () => {
    expect(sameTimeText("TBD", "08:15")).toBe(false);
    expect(sameTimeText("08:15", "")).toBe(false);
  });
});
