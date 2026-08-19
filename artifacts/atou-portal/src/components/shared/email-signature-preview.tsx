// On-screen replica of Pam's email signature so the Send page preview matches
// what recipients receive. The real signature is rendered by the API server.

const BADGES_SRC = `${import.meta.env.BASE_URL}email/atou-badges.png`
const BADGES_ALT =
  "ATOU awards: 30th Anniversary ATOU seal, Candid Platinum Transparency 2025, " +
  "GreatNonprofits 2025 Top-Rated Nonprofit, Style Readers' Choice Awards '25 Winner, " +
  "2026 California Nonprofit of the Year"

export function EmailSignaturePreview({ cancellationPolicyUrl }: { cancellationPolicyUrl?: string }) {
  return (
    <div className="text-sm leading-relaxed text-foreground">
      <p className="font-bold italic text-base">Pam Evers</p>
      <p className="font-bold italic text-base mb-3">Program Manager</p>
      <p>A Touch of Understanding, Inc.</p>
      <p>5280 Stirling Street, Suite 102</p>
      <p className="mb-3">Granite Bay, CA 95746</p>
      <p className="mb-3">
        <a href="tel:+19167914146" className="text-primary underline underline-offset-4">916-791-4146</a>
      </p>
      <p className="mb-3">
        <a href="https://www.touchofunderstanding.org" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
          www.touchofunderstanding.org
        </a>
      </p>
      <p className="mb-4">
        <a
          href={cancellationPolicyUrl || "https://touchofunderstanding.org/"}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-4 font-bold"
        >
          CANCELLATION POLICY
        </a>
      </p>
      <img src={BADGES_SRC} alt={BADGES_ALT} className="block w-full max-w-[420px] h-auto" />
    </div>
  )
}
