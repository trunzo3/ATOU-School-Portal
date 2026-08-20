import { describe, expect, it } from "vitest";
import {
  airtableCellToString,
  decideFieldSync,
  decideTeacherSync,
} from "./airtable-merge";

describe("decideFieldSync", () => {
  it("does nothing when both sides already agree", () => {
    expect(decideFieldSync({ last: "9:00 AM", airtable: "9:00 AM", portal: "9:00 AM" })).toEqual({
      action: "none",
      nextLast: "9:00 AM",
    });
  });

  it("re-records the baseline when both sides agree but the baseline is stale", () => {
    // e.g. the write-back succeeded but recording the state failed
    expect(decideFieldSync({ last: "old", airtable: "new", portal: "new" })).toEqual({
      action: "none",
      nextLast: "new",
    });
  });

  it("pulls when only Airtable changed", () => {
    expect(decideFieldSync({ last: "gym", airtable: "library", portal: "gym" })).toEqual({
      action: "pull",
      nextLast: "library",
    });
  });

  it("pulls an Airtable clear when the portal did not change", () => {
    expect(decideFieldSync({ last: "gym", airtable: "", portal: "gym" })).toEqual({
      action: "pull",
      nextLast: "",
    });
  });

  it("pushes when only the portal changed (reconciles a failed write-back)", () => {
    expect(decideFieldSync({ last: "gym", airtable: "gym", portal: "cafeteria" })).toEqual({
      action: "push",
      nextLast: "cafeteria",
    });
  });

  it("pushes the portal value when BOTH sides changed — portal wins", () => {
    expect(decideFieldSync({ last: "gym", airtable: "library", portal: "cafeteria" })).toEqual({
      action: "push",
      nextLast: "cafeteria",
    });
  });

  describe("first sync (no baseline)", () => {
    it("adopts the shared value when both sides agree", () => {
      expect(decideFieldSync({ last: undefined, airtable: "gym", portal: "gym" })).toEqual({
        action: "none",
        nextLast: "gym",
      });
    });

    it("portal wins when it has a value", () => {
      expect(decideFieldSync({ last: undefined, airtable: "gym", portal: "cafeteria" })).toEqual({
        action: "push",
        nextLast: "cafeteria",
      });
    });

    it("adopts the Airtable value when the portal is empty", () => {
      expect(decideFieldSync({ last: undefined, airtable: "gym", portal: "" })).toEqual({
        action: "pull",
        nextLast: "gym",
      });
    });

    it("does nothing when both sides are empty", () => {
      expect(decideFieldSync({ last: undefined, airtable: "", portal: "" })).toEqual({
        action: "none",
        nextLast: "",
      });
    });
  });
});

describe("decideTeacherSync", () => {
  const base = {
    lastNames: "Ada Lovelace: 24",
    lastEmails: "ada@school.org",
  };

  it("does nothing when nothing changed", () => {
    expect(
      decideTeacherSync({
        ...base,
        airtableNames: "Ada Lovelace: 24",
        airtableEmails: "ada@school.org",
        portalNames: "Ada Lovelace: 24",
        portalEmails: "ada@school.org",
      }),
    ).toBe("none");
  });

  it("pulls when either Airtable field changed", () => {
    expect(
      decideTeacherSync({
        ...base,
        airtableNames: "Ada Lovelace: 24",
        airtableEmails: "ada.lovelace@school.org", // email edited in Airtable
        portalNames: "Ada Lovelace: 24",
        portalEmails: "ada@school.org",
      }),
    ).toBe("pull");
  });

  it("pushes when the portal list changed, even if Airtable changed too", () => {
    expect(
      decideTeacherSync({
        ...base,
        airtableNames: "Grace Hopper: 30",
        airtableEmails: "grace@school.org",
        portalNames: "Ada Lovelace: 24\nAlan Turing: 22",
        portalEmails: "ada@school.org\nalan@school.org",
      }),
    ).toBe("push");
  });

  it("on first sync, pushes the portal list when the portal has teachers", () => {
    expect(
      decideTeacherSync({
        lastNames: undefined,
        lastEmails: undefined,
        airtableNames: "Old Text 20",
        airtableEmails: "old@school.org",
        portalNames: "Ada Lovelace: 24",
        portalEmails: "ada@school.org",
      }),
    ).toBe("push");
  });

  it("on first sync, pulls the Airtable text when the portal has no teachers", () => {
    expect(
      decideTeacherSync({
        lastNames: undefined,
        lastEmails: undefined,
        airtableNames: "Beardsley 4th 32 students",
        airtableEmails: "beardsley@school.org",
        portalNames: "",
        portalEmails: "",
      }),
    ).toBe("pull");
  });
});

describe("airtableCellToString", () => {
  it("returns empty string for null/undefined", () => {
    expect(airtableCellToString(null)).toBe("");
    expect(airtableCellToString(undefined)).toBe("");
  });

  it("trims scalars and stringifies numbers", () => {
    expect(airtableCellToString("  9:00 AM  ")).toBe("9:00 AM");
    expect(airtableCellToString(42)).toBe("42");
  });

  it("joins lookup arrays with newlines", () => {
    expect(airtableCellToString(["a@x.org", "b@x.org"])).toBe("a@x.org\nb@x.org");
  });
});
