import { useParams, Link } from "wouter"
import { useGetPortalPages } from "@workspace/api-client-react"
import { PortalLayout } from "@/components/layout/portal-layout"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"

export function PortalPage() {
  const { code, slug } = useParams<{ code: string, slug: string }>()
  const { data: pages, isLoading } = useGetPortalPages(code || "")

  if (isLoading) return <PortalLayout><div className="p-8 text-center text-muted-foreground animate-pulse">Loading page...</div></PortalLayout>

  const page = pages?.find(p => p.slug === slug)

  if (!page) {
    return (
      <PortalLayout>
        <div className="text-center py-20">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-secondary/10 text-secondary flex items-center justify-center font-serif text-xl font-bold" aria-hidden="true">?</div>
          <h2 className="text-3xl font-serif font-bold mb-4">Page Not Found</h2>
          <Link href={`/s/${code}`}>
            <Button variant="outline">Back to Form</Button>
          </Link>
        </div>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout>
      <div className="mb-6">
        <Link href={`/s/${code}`}>
          <Button variant="ghost" className="-ml-4 text-muted-foreground">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to Form
          </Button>
        </Link>
      </div>

      <article className="bg-white rounded-2xl border border-x-border border-b-border border-t-8 border-t-primary p-6 sm:p-8 md:p-12 shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary mb-3">Helpful Information</p>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-foreground mb-8">{page.title}</h1>
        
        <div 
          className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:text-foreground prose-a:text-primary prose-a:font-semibold hover:prose-a:text-primary/80 prose-a:transition-colors prose-a:underline-offset-4 prose-p:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: page.body }}
        />
      </article>
    </PortalLayout>
  )
}