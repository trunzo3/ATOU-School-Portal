import { InfoPage } from "@workspace/api-client-react"
import { Link } from "wouter"
import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PortalHelpfulInformationProps {
  code: string
  pages?: InfoPage[]
}

export function PortalHelpfulInformation({ code, pages }: PortalHelpfulInformationProps) {
  if (!pages?.length) return null

  return (
    <section aria-labelledby="helpful-information-title" className="mb-8 p-6 bg-white border border-border rounded-xl shadow-sm no-print">
      <h3 id="helpful-information-title" className="font-serif text-lg font-bold mb-4 flex items-center gap-3 text-foreground">
        <span className="h-10 w-10 rounded-full bg-secondary/10 text-secondary flex items-center justify-center border border-secondary/20" aria-hidden="true">
          <FileText className="h-5 w-5" />
        </span>
        Helpful Information
      </h3>
      <div className="flex flex-wrap gap-3">
        {pages.map(page => (
          <Button key={page.id} asChild variant="outline" className="rounded-full bg-white hover:bg-secondary/5 hover:text-secondary hover:border-secondary/30 transition-colors shadow-sm">
            <Link href={`/s/${code}/pages/${page.slug}`}>
              {page.title}
            </Link>
          </Button>
        ))}
      </div>
    </section>
  )
}