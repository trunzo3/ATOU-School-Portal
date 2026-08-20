import { describe, expect, it } from "vitest";
import { pendingSendDate } from "./pending-send";

describe("pendingSendDate (automatic sending off — reminder for Pam)", () => {
  it("returns workshop minus 60 days for a never-sent school with a future due date", () => {
    // Oct 9 workshop → email due Aug 10.
    expect(pendingSendDate("2026-10-09", "never_sent", { today: "2026-08-01" })).toBe("2026-08-10");
    // Nov 6 workshop → email due Sep 7.
    expect(pendingSendDate("2026-11-06", "never_sent", { today: "2026-08-20" })).toBe("2026-09-07");
  });

  it("keeps showing an overdue date while the workshop is still 30+ days away", () => {
    // Due Aug 10, today Aug 20 — 10 days overdue, workshop 50 days out.
    expect(pendingSendDate("2026-10-09", "never_sent", { today: "2026-08-20" })).toBe("2026-08-10");
  });

  it("returns null once the workshop is less than 30 days away", () => {
    // Sep 4 workshop, today Aug 20 — only 15 days out; the two-months-out
    // email no longer makes sense.
    expect(pendingSendDate("2026-09-04", "never_sent", { today: "2026-08-20" })).toBeNull();
  });

  it("cuts off exactly at the 30-day boundary", () => {
    // Sep 19 workshop: cutoff day is Aug 20 — still shown on the boundary…
    expect(pendingSendDate("2026-09-19", "never_sent", { today: "2026-08-20" })).toBe("2026-07-21");
    // …and gone the day after.
    expect(pendingSendDate("2026-09-19", "never_sent", { today: "2026-08-21" })).toBeNull();
  });

  it("returns null for schools that were already emailed", () => {
    expect(pendingSendDate("2026-10-09", "sent_waiting", { today: "2026-08-01" })).toBeNull();
    expect(pendingSendDate("2026-10-09", "answered", { today: "2026-08-01" })).toBeNull();
  });

  it("returns null without a workshop date or with a malformed one", () => {
    expect(pendingSendDate(null, "never_sent", { today: "2026-08-01" })).toBeNull();
    expect(pendingSendDate("not-a-date", "never_sent", { today: "2026-08-01" })).toBeNull();
  });
});

describe("pendingSendDate (automatic sending on — real schedule)", () => {
  it("uses the configured days-before instead of 60", () => {
    // 45 days before Oct 9 is Aug 25.
    expect(
      pendingSendDate("2026-10-09", "never_sent", {
        today: "2026-08-01",
        daysBefore: 45,
        autoEnabled: true,
      }),
    ).toBe("2026-08-25");
  });

  it("hides past due dates: an automatic send that missed its day won't fire", () => {
    // Due Aug 10, today Aug 20 — the daily script only sends on the exact day.
    expect(
      pendingSendDate("2026-10-09", "never_sent", { today: "2026-08-20", autoEnabled: true }),
    ).toBeNull();
  });

  it("shows a due date that is today or later", () => {
    expect(
      pendingSendDate("2026-10-19", "never_sent", { today: "2026-08-20", autoEnabled: true }),
    ).toBe("2026-08-20");
    expect(
      pendingSendDate("2026-11-06", "never_sent", { today: "2026-08-20", autoEnabled: true }),
    ).toBe("2026-09-07");
  });
});

describe("pendingSendDate (skipped schools)", () => {
  it("returns null when Pam skipped the school's automatic send", () => {
    expect(
      pendingSendDate("2026-11-06", "never_sent", { today: "2026-08-20", skipped: true }),
    ).toBeNull();
    expect(
      pendingSendDate("2026-11-06", "never_sent", {
        today: "2026-08-20",
        skipped: true,
        autoEnabled: true,
      }),
    ).toBeNull();
  });
});
