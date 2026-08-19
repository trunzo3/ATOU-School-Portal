// Pam Evers' official ATOU email signature, appended automatically to every
// school email and test email. The badge strip image is served by the portal
// (public/email/atou-badges.png) so email clients can load it over HTTPS.

import { appBaseUrl } from "./appUrl";

// touchofunderstanding.org has no public cancellation-policy page today, so
// the link target is configurable in Settings; this is the fallback.
export const DEFAULT_CANCELLATION_POLICY_URL = "https://touchofunderstanding.org/";

const PHONE_DISPLAY = "916-791-4146";
const PHONE_TEL = "tel:+19167914146";
const WEBSITE_DISPLAY = "www.touchofunderstanding.org";
const WEBSITE_URL = "https://www.touchofunderstanding.org";
const LINK_COLOR = "#0563c1";

const BADGES_ALT =
  "ATOU awards: 30th Anniversary ATOU seal, Candid Platinum Transparency 2025, " +
  "GreatNonprofits 2025 Top-Rated Nonprofit, Style Readers' Choice Awards '25 Winner, " +
  "2026 California Nonprofit of the Year";

export function badgeImageUrl(): string {
  const base = appBaseUrl();
  return base ? `${base}/email/atou-badges.png` : "";
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Plain-text signature for recipients whose email client shows the text part.
export function signatureText(cancellationPolicyUrl: string): string {
  return [
    "Pam Evers",
    "Program Manager",
    "A Touch of Understanding, Inc.",
    "5280 Stirling Street, Suite 102",
    "Granite Bay, CA 95746",
    PHONE_DISPLAY,
    WEBSITE_DISPLAY,
    `Cancellation policy: ${cancellationPolicyUrl}`,
  ].join("\n");
}

export function appendSignatureText(body: string, cancellationPolicyUrl: string): string {
  return `${body.replace(/\s+$/, "")}\n\n${signatureText(cancellationPolicyUrl)}`;
}

export function signatureHtml(cancellationPolicyUrl: string): string {
  const badges = badgeImageUrl();
  const policyHref = escapeHtml(cancellationPolicyUrl);
  return `<div style="margin-top:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111111;line-height:1.5;">
  <p style="margin:0;font-weight:bold;font-style:italic;font-size:16px;">Pam Evers</p>
  <p style="margin:0 0 12px;font-weight:bold;font-style:italic;font-size:16px;">Program Manager</p>
  <p style="margin:0;">A Touch of Understanding, Inc.</p>
  <p style="margin:0;">5280 Stirling Street, Suite 102</p>
  <p style="margin:0 0 12px;">Granite Bay, CA 95746</p>
  <p style="margin:0 0 12px;"><a href="${PHONE_TEL}" style="color:${LINK_COLOR};">${PHONE_DISPLAY}</a></p>
  <p style="margin:0 0 12px;"><a href="${WEBSITE_URL}" style="color:${LINK_COLOR};">${WEBSITE_DISPLAY}</a></p>
  <p style="margin:0 0 16px;"><a href="${policyHref}" style="color:${LINK_COLOR};font-weight:bold;">CANCELLATION POLICY</a></p>${badges ? `
  <img src="${escapeHtml(badges)}" alt="${escapeHtml(BADGES_ALT)}" width="524" style="display:block;max-width:100%;height:auto;border:0;" />` : ""}
</div>`;
}

// Full HTML email: the (plain-text) message body converted to simple HTML,
// with URLs made clickable, followed by the signature block.
export function renderEmailHtml(body: string, cancellationPolicyUrl: string): string {
  const escaped = escapeHtml(body.replace(/\s+$/, ""));
  const linked = escaped.replace(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}" style="color:${LINK_COLOR};">${url}</a>`,
  );
  const withBreaks = linked.replaceAll("\r\n", "\n").replaceAll("\n", "<br />");
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background-color:#ffffff;">
<div style="max-width:640px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111111;line-height:1.5;">${withBreaks}</div>
${signatureHtml(cancellationPolicyUrl)}
</body>
</html>`;
}
