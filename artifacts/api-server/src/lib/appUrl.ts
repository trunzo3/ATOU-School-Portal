// The app's own web address, from an environment variable so ATOU can move
// to their own domain later without breaking links already sent to schools.
export function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(",")[0]}`;
  return "";
}

export function schoolLink(code: string): string {
  return `${appBaseUrl()}/s/${code}`;
}
