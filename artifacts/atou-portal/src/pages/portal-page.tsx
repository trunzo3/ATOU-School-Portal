import { useParams, Link } from "wouter"
import { useGetPortalPages } from "@workspace/api-client-react"
import { PortalLayout } from "@/components/layout/portal-layout"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"

export function PortalPage() {
  const { code, slug } = useParams<{ code: string, slug: string }>()
  const { data: pages, isLoading } = useGetPortalPages(code || "")

  if (isLoading) return <PortalLayout><div className="p-8 text-center">Loading...</div></PortalLayout>

  const page = pages?.find(p => p.slug === slug)

  if (!page) {
    return (
      <PortalLayout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-serif mb-4">Page Not Found</h2>
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

      <article className="bg-white rounded-xl shadow-sm border border-[#e2e4e0] p-8 md:p-12">
        <h1 className="text-3xl font-serif font-bold text-[#325566] mb-8">{page.title}</h1>
        
        <div 
          className="prose prose-slate max-w-none prose-headings:font-serif prose-a:text-[#325566] prose-a:font-medium prose-p:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: page.body }}
        />
      </article>
    </PortalLayout>
  )
}