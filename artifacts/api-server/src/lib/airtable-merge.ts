/**
 * Pure decision logic for the two-way Airtable sync. No database, no
 * network — just: given the last value both sides agreed on, the value in
 * Airtable now, and the value in the portal now, which way does this field
 * move?
 *
 * Rules (from the sync spec):
 * - If only Airtable changed since the last sync, the Airtable value is
 *   pulled into the app (as a history entry attributed to Airtable).
 * - If only the portal changed (e.g. a write-back failed), the portal
 *   value is pushed to Airtable.
 * - If BOTH changed, the portal wins and its value is pushed to Airtable.
 * - With no baseline yet (first sync for this school), the portal wins
 *   whenever it has a value; an empty portal field adopts the Airtable
 *   value.
 */

/** History attribution for changes that came in from Airtable. */
export const AIRTABLE_ENTERED_BY = "Airtable";

export type FieldSyncDecision = {
  /** none = already in agreement; pull = Airtable → app; push = app → Airtable. */
  action: "none" | "pull" | "push";
  /** What the last-synced value becomes if the action succeeds. */
  nextLast: string;
};

export function decideFieldSync(args: {
  /** Last value both sides agreed on; undefined = no baseline yet. */
  last: string | undefined;
  airtable: string;
  portal: string;
  /**
   * Optional equivalence for values with several spellings of the same
   * thing (defaults to strict equality). The workshop-time field passes a
   * clock-value comparison here so the portal's normalized "08:15" derived
   * from Airtable's "8:15am - 9:45am" is not mistaken for a portal edit
   * and pushed back over Airtable's original text.
   */
  same?: (a: string, b: string) => boolean;
}): FieldSyncDecision {
  const { last, airtable, portal } = args;
  const same = args.same ?? ((a: string, b: string) => a === b);
  if (same(airtable, portal)) {
    // Both sides already agree — just (re)record the baseline. Airtable's
    // spelling becomes the baseline so an equivalent-but-different portal
    // form never reads as a change on later passes.
    return { action: "none", nextLast: airtable };
  }
  if (last === undefined) {
    // No baseline: portal wins when it has a value, otherwise adopt Airtable's.
    return portal !== ""
      ? { action: "push", nextLast: portal }
      : { action: "pull", nextLast: airtable };
  }
  if (!same(portal, last)) {
    // Portal changed — portal wins, even if Airtable changed too.
    return { action: "push", nextLast: portal };
  }
  if (!same(airtable, last)) {
    return { action: "pull", nextLast: airtable };
  }
  return { action: "none", nextLast: last };
}

/**
 * The teacher list lives in TWO Airtable fields (names-with-counts and
 * emails) but is one answer in the app, so the decision is made on the
 * pair: a change to either field counts as a change to the whole list.
 */
export function decideTeacherSync(args: {
  lastNames: string | undefined;
  lastEmails: string | undefined;
  airtableNames: string;
  airtableEmails: string;
  portalNames: string;
  portalEmails: string;
}): "none" | "pull" | "push" {
  const SEP = "\u001f";
  // An all-empty pair must compare as "" so the no-baseline rule
  // ("empty portal adopts Airtable") still applies to teacher lists.
  const join = (names: string, emails: string): string =>
    names === "" && emails === "" ? "" : `${names}${SEP}${emails}`;
  const last =
    args.lastNames === undefined && args.lastEmails === undefined
      ? undefined
      : join(args.lastNames ?? "", args.lastEmails ?? "");
  return decideFieldSync({
    last,
    airtable: join(args.airtableNames, args.airtableEmails),
    portal: join(args.portalNames, args.portalEmails),
  }).action;
}

/** Airtable cell → comparable string ("" for empty; lookups join with newlines). */
export function airtableCellToString(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join("\n").trim();
  return String(value).trim();
}
