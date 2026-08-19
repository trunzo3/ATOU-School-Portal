import { AtouLogo } from "@/components/shared/atou-logo"

export function PortalLayout({ children, schoolName }: { children: React.ReactNode, schoolName?: string }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-muted/30 text-foreground">
      <header className="bg-card/95 backdrop-blur border-b px-4 py-4 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-50 no-print">
        <div className="flex items-center gap-3">
          <AtouLogo className="h-14 w-14 flex-shrink-0 drop-shadow-sm" />
          <div>
            <h1 className="font-serif text-xl sm:text-2xl font-bold text-foreground tracking-tight">A Touch of Understanding</h1>
            <p className="text-xs sm:text-sm text-primary font-medium mt-0.5 uppercase tracking-wider">Workshop Logistics Portal</p>
          </div>
        </div>
        {schoolName && (
          <div className="flex items-center gap-2 text-sm font-semibold bg-secondary/10 px-4 py-2 rounded-full border border-secondary/20">
            <span className="truncate max-w-[240px] text-secondary">{schoolName}</span>
          </div>
        )}
      </header>

      {/* Print-only header */}
      <div className="hidden print:flex mb-8 border-b-2 border-brand-navy pb-4 items-center gap-4">
        <AtouLogo className="h-18 w-18" />
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">A Touch of Understanding</h1>
          <p className="text-xl text-muted-foreground mt-1">Workshop Logistics Form: {schoolName}</p>
        </div>
      </div>

      <main className="flex-1 flex flex-col items-center p-4 sm:p-8 sm:py-12">
        <div className="w-full max-w-4xl">
          {children}
        </div>
      </main>

      <footer className="px-4 py-10 text-center text-sm text-muted-foreground no-print border-t mt-auto bg-card">
        <p>If you have questions, contact us at <a href="mailto:programcoordinator@touchofunderstanding.org" className="text-primary underline-offset-4 hover:underline font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">programcoordinator@touchofunderstanding.org</a></p>
      </footer>
    </div>
  )
}