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

// Merge fields available in the subject and message templates.
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
    .replaceAll("{{link}}", school.link);
}
