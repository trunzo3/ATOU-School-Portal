import { Link } from "wouter"
import { FileText, ChevronRight } from "lucide-react"

export function PortalLayout({ children, schoolName }: { children: React.ReactNode, schoolName?: string }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#fbfbf9] text-[#1c232e]">
      <header className="bg-white border-b border-[#e2e4e0] px-4 py-4 sm:px-8 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-50 no-print">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-semibold text-[#325566]">A Touch of Understanding</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Workshop Logistics Portal</p>
        </div>
        {schoolName && (
          <div className="flex items-center gap-2 text-sm font-medium bg-[#f2efe9] px-3 py-1.5 rounded-full">
            <span className="truncate max-w-[200px]">{schoolName}</span>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center p-4 sm:p-8">
        <div className="w-full max-w-3xl">
          {children}
        </div>
      </main>
      
      {/* Print-only header */}
      <div className="hidden print:block mb-8 border-b-2 border-black pb-4">
        <h1 className="font-serif text-3xl font-bold">A Touch of Understanding</h1>
        <p className="text-xl">Workshop Logistics Form: {schoolName}</p>
      </div>

      <footer className="py-8 text-center text-sm text-muted-foreground no-print border-t mt-12 bg-white">
        <p>If you have questions, contact us at programcoordinator@touchofunderstanding.org</p>
      </footer>
    </div>
  )
}