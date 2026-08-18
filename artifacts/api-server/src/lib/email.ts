// Email sending layer. Resend is the planned provider but is not connected
// yet: until RESEND_API_KEY is set, sends are recorded in the log with
// delivered=false and no email actually goes out. The UI surfaces this.

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export type SendResult = { delivered: boolean; error?: string };

export async function sendEmail(args: {
  to: string[];
  subject: string;
  text: string;
}): Promise<SendResult> {
  if (!emailConfigured()) {
    return { delivered: false };
  }
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: args.to, subject: args.subject, text: args.text }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return { delivered: false, error: `Email service error (${resp.status}): ${detail.slice(0, 300)}` };
  }
  return { delivered: true };
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
