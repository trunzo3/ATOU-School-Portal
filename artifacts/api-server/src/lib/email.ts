// Email sending layer. The RESEND_API_KEY is held in Replit Secrets and is
// never exposed through the API.

export const EMAIL_FROM =
  "A Touch of Understanding <workshops@send.touchofunderstanding.org>";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export type SendResult = {
  delivered: boolean;
  providerId?: string;
  error?: string;
};

export async function sendEmail(args: {
  to: string[];
  subject: string;
  text: string;
  // Optional HTML body; the text part stays as the plain-text fallback.
  html?: string;
}): Promise<SendResult> {
  if (!emailConfigured()) {
    return { delivered: false };
  }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: args.to,
        subject: args.subject,
        text: args.text,
        ...(args.html ? { html: args.html } : {}),
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return {
        delivered: false,
        error: `Resend error (${resp.status}): ${detail.slice(0, 300)}`,
      };
    }
    const payload = (await resp.json().catch(() => null)) as
      | { id?: unknown }
      | null;
    return {
      delivered: true,
      providerId:
        typeof payload?.id === "string" ? payload.id : undefined,
    };
  } catch {
    return {
      delivered: false,
      error: "Could not reach Resend. Please try again.",
    };
  }
}

// Merge fields available in the subject and message templates. Besides the
// canonical {{...}} fields, the literal "WORKSHOP DATE" marker (as typed in
// Pam's original email wording) is also replaced with the formatted date.
export function fillMergeFields(
  template: string,
  school: { name: string; workshopDate: string | null; link: string },
): string {
  const dateText = school.workshopDate
    ? new Date(`${school.workshopDate}T12:00:00-08:00`).toLocaleDateString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "TBD";
  return template
    .replaceAll("{{school_name}}", school.name)
    .replaceAll("{{workshop_date}}", dateText)
    .replaceAll("WORKSHOP DATE", dateText)
    .replaceAll("{{link}}", school.link);
}

// Pam's plain contact block. It lives inside the editable message body (every
// template ends with it), so nothing is appended automatically at send time
// and recipients see exactly one signature.
export const PLAIN_SIGNATURE = [
  "Pam Evers",
  "Program Manager",
  "A Touch of Understanding, Inc.",
  "5280 Stirling Street, Suite 102",
  "Granite Bay, CA 95746",
  "916-791-4146",
  "www.touchofunderstanding.org",
].join("\n");

// A body already carries a typed contact block when a line is exactly
// "Pam Evers" — that also matches wording Pam migrated from her old emails.
export function hasPlainSignature(body: string): boolean {
  return /^[ \t]*Pam Evers[ \t]*$/m.test(body);
}

// Append the plain contact block to a body that lacks one, leaving bodies
// that already carry their own (possibly differently worded) block untouched.
export function ensurePlainSignature(body: string): string {
  if (hasPlainSignature(body)) return body;
  return `${body.replace(/\s+$/, "")}\n\n${PLAIN_SIGNATURE}`;
}

const LINK_COLOR = "#0563c1";

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Full HTML email: the (plain-text) message body converted to simple HTML
// with URLs made clickable. Nothing is added beyond what the body says, so
// the HTML part always matches the plain-text part.
export function renderEmailHtml(body: string): string {
  const escaped = escapeHtml(body.replace(/\s+$/, ""));
  const linked = escaped.replace(
    /(?:https?:\/\/|www\.)[^\s<]+/g,
    (url) => {
      const href = url.startsWith("www.") ? `https://${url}` : url;
      return `<a href="${href}" style="color:${LINK_COLOR};">${url}</a>`;
    },
  );
  const withBreaks = linked.replaceAll("\r\n", "\n").replaceAll("\n", "<br />");
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background-color:#ffffff;">
<div style="max-width:640px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111111;line-height:1.5;">${withBreaks}</div>
</body>
</html>`;
}
