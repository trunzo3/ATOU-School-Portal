import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PLAIN_SIGNATURE,
  ensurePlainSignature,
  fillMergeFields,
  hasPlainSignature,
  renderEmailHtml,
  sendEmail,
} from "./email";

const school = {
  name: "Granite Bay Elementary",
  workshopDate: "2026-10-14",
  link: "https://example.org/s/abc123",
};

describe("fillMergeFields", () => {
  it("fills the canonical merge fields with school-specific values", () => {
    const out = fillMergeFields(
      "Logistics for {{school_name}} on {{workshop_date}}: {{link}}",
      school,
    );
    expect(out).toBe(
      "Logistics for Granite Bay Elementary on October 14, 2026: https://example.org/s/abc123",
    );
  });

  it("replaces the legacy WORKSHOP DATE marker with the same formatted date", () => {
    const out = fillMergeFields(
      "Your workshop is scheduled for WORKSHOP DATE.",
      school,
    );
    expect(out).toBe("Your workshop is scheduled for October 14, 2026.");
  });

  it("resolves both date forms identically in one message", () => {
    const out = fillMergeFields("{{workshop_date}} == WORKSHOP DATE", school);
    expect(out).toBe("October 14, 2026 == October 14, 2026");
  });

  it("falls back to TBD for schools without a workshop date, in both forms", () => {
    const noDate = { ...school, workshopDate: null };
    expect(fillMergeFields("{{workshop_date}}", noDate)).toBe("TBD");
    expect(fillMergeFields("WORKSHOP DATE", noDate)).toBe("TBD");
  });

  it("leaves ordinary lowercase wording about the workshop date alone", () => {
    const out = fillMergeFields("about your workshop date", school);
    expect(out).toBe("about your workshop date");
  });
});

describe("ensurePlainSignature", () => {
  it("appends Pam's contact block to a body that lacks one", () => {
    const body = "Hello,\n\nPlease fill in logistics.\n\nThank you,\nPam";
    const out = ensurePlainSignature(body);
    expect(out).toBe(`${body}\n\n${PLAIN_SIGNATURE}`);
    expect(hasPlainSignature(out)).toBe(true);
  });

  it("leaves a body with a typed contact block untouched", () => {
    // Pam's migrated wording: her own variant ("Inc." without a comma,
    // trailing spaces) must be preserved verbatim, not replaced.
    const body = [
      "Hello,",
      "",
      "Thank you,",
      "Pam ",
      "",
      "Pam Evers",
      "Program Manager",
      "A Touch of Understanding Inc.",
      "5280 Stirling Street, Suite 102",
      "Granite Bay, CA 95746 ",
      "916-791-4146",
      "www.touchofunderstanding.org",
    ].join("\n");
    expect(ensurePlainSignature(body)).toBe(body);
  });

  it("is idempotent, so a repaired template is never given a second block", () => {
    const once = ensurePlainSignature("Hello,\n\nThank you,\nPam");
    const twice = ensurePlainSignature(once);
    expect(twice).toBe(once);
    expect(twice.match(/^Pam Evers$/gm)).toHaveLength(1);
  });
});

describe("renderEmailHtml", () => {
  const body = ensurePlainSignature(
    "Hello,\n\nPlease fill in logistics here: https://example.org/s/abc123\n\nThank you,\nPam",
  );
  const html = renderEmailHtml(body);

  it("contains exactly one Pam Evers signature and no appended extras", () => {
    expect(html.match(/Pam Evers/g)).toHaveLength(1);
    expect(html).not.toContain("CANCELLATION POLICY");
    expect(html).not.toContain("Cancellation policy");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("atou-badges");
  });

  it("makes the school link and the plain website line clickable", () => {
    expect(html).toContain('<a href="https://example.org/s/abc123"');
    expect(html).toContain('<a href="https://www.touchofunderstanding.org"');
    expect(html).toContain(">www.touchofunderstanding.org</a>");
  });

  it("escapes HTML in the body", () => {
    expect(renderEmailHtml("a <b> & 'c' \"d\"")).toContain(
      "a &lt;b&gt; &amp; &#39;c&#39; &quot;d&quot;",
    );
  });

  it("keeps the plain-text and HTML parts in step (no HTML-only content)", () => {
    const stripped = html
      .replace(/<a [^>]*>/g, "")
      .replace(/<\/a>/g, "")
      .replace(/<br \/>/g, "\n");
    for (const line of PLAIN_SIGNATURE.split("\n")) {
      expect(stripped).toContain(line);
    }
  });
});

describe("sendEmail without a Resend key", () => {
  const savedKey = process.env.RESEND_API_KEY;
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.RESEND_API_KEY = savedKey;
  });

  it("reports not delivered and never contacts the network", async () => {
    // No fetch mock is installed: if sendEmail tried the network against the
    // real API it would either throw in this offline test or return an error.
    const result = await sendEmail({
      to: ["someone@example.org"],
      subject: "Test",
      text: "Body",
    });
    expect(result).toEqual({ delivered: false });
  });
});
