import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  overrideLinesFromSchedule,
  overrideDisplayLines,
  parseScheduleOverride,
  serializeScheduleOverride,
} from "@workspace/schedule";

// The manual provisional-schedule override is stored as human-readable text
// under the "schedule_override" answer key. These tests pin the format's
// round-trip so history entries stay readable AND parseable.

describe("schedule override serialization", () => {
  it("round-trips the calculated two-session schedule", () => {
    const schedule = buildSchedule({
      workshopTime: "08:15",
      lunchStart: "",
      lunchEnd: "",
      threeSessions: false,
    })!;
    const lines = overrideLinesFromSchedule(schedule);
    expect(lines).toEqual([
      { label: "Session 1", start: "08:15", end: "09:45" },
      { label: "Break", start: "09:45", end: "10:00" },
      { label: "Session 2", start: "10:00", end: "11:30" },
    ]);
    const serialized = serializeScheduleOverride(lines);
    expect(serialized).toBe(
      "Session 1: 8:15 AM – 9:45 AM\nBreak: 9:45 AM – 10:00 AM\nSession 2: 10:00 AM – 11:30 AM",
    );
    expect(parseScheduleOverride(serialized)).toEqual(lines);
  });

  it("round-trips a three-session schedule including lunch", () => {
    const schedule = buildSchedule({
      workshopTime: "09:00",
      lunchStart: "12:15",
      lunchEnd: "13:00",
      threeSessions: true,
    })!;
    const lines = overrideLinesFromSchedule(schedule);
    expect(lines.map((l) => l.label)).toEqual([
      "Session 1",
      "Break",
      "Session 2",
      "Lunch",
      "Session 3",
    ]);
    expect(parseScheduleOverride(serializeScheduleOverride(lines))).toEqual(lines);
  });

  it("treats blank and unrecognized values as no override", () => {
    expect(parseScheduleOverride("")).toBeNull();
    expect(parseScheduleOverride("   \n ")).toBeNull();
    expect(parseScheduleOverride(null)).toBeNull();
    expect(parseScheduleOverride(undefined)).toBeNull();
    expect(parseScheduleOverride("free text from Airtable")).toBeNull();
    // Unknown label
    expect(parseScheduleOverride("Session 9: 8:00 AM – 9:00 AM")).toBeNull();
    // One bad line spoils the whole value (all-or-nothing round-trip)
    expect(
      parseScheduleOverride("Session 1: 8:00 AM – 9:30 AM\nBreak: whenever"),
    ).toBeNull();
  });

  it("accepts a hyphen and PM times when parsing", () => {
    const parsed = parseScheduleOverride("Session 1: 12:45 PM - 2:15 PM");
    expect(parsed).toEqual([{ label: "Session 1", start: "12:45", end: "14:15" }]);
    expect(overrideDisplayLines(parsed!)[0]!.time).toBe("12:45 PM – 2:15 PM");
  });

  it("formats display lines from adjusted 24-hour times", () => {
    const lines = overrideDisplayLines([
      { label: "Session 1", start: "08:05", end: "09:35" },
      { label: "Break", start: "09:35", end: "09:50" },
    ]);
    expect(lines.map((l) => `${l.label}: ${l.time}`)).toEqual([
      "Session 1: 8:05 AM – 9:35 AM",
      "Break: 9:35 AM – 9:50 AM",
    ]);
  });
});
