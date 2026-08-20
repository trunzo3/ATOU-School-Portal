import { useGetSummaryReport, getGetSummaryReportQueryKey } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatPacificTime, cn } from "@/lib/utils"
import { Printer, Download, LayoutDashboard, AlertCircle, CalendarDays, Send, History } from "lucide-react"
import { Link, useLocation } from "wouter"

// Shared date shorthand: "Sep 5, 2026" for date-only values,
// "Sep 5, 2026, 4:12 PM" for timestamps.
const day = (value: string | null | undefined) =>
  value ? formatPacificTime(value).split(",").slice(0, 2).join(",") : "N/A"

function SchoolLink({ id, name }: { id: number; name: string }) {
  return (
    <Link href={`/admin/schools/${id}`} className="font-medium text-primary hover:underline">
      {name}
    </Link>
  )
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground italic">{children}</p>
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function AdminSummary() {
  const { data: report, isLoading } = useGetSummaryReport({
    query: { queryKey: getGetSummaryReportQueryKey(), refetchInterval: 60_000 },
  })
  const [, navigate] = useLocation()

  if (isLoading || !report) {
    return <AdminLayout><div className="p-8 text-muted-foreground animate-pulse">Building the summary...</div></AdminLayout>
  }

  const na = report.needsAttention
  const attentionCount =
    na.sentWaiting.length + na.notSent.length + na.missingCounts.length +
    na.conflicts.length + na.lockedWithGaps.length

  const tiles = [
    { label: "Workshops", sub: `next ${report.windowDays} days`, total: report.counts.workshops, status: "", valueClass: "text-primary", cardClass: "bg-primary/5 border-primary/20" },
    { label: "Complete", sub: "all answers in", total: report.counts.complete, status: "complete", valueClass: "text-foreground", cardClass: "border-border hover:border-primary/20" },
    { label: "Partial", sub: "some answers in", total: report.counts.partial, status: "partial", valueClass: "text-amber-600", cardClass: "border-border hover:border-amber-500/20" },
    { label: "Untouched", sub: "nothing entered", total: report.counts.untouched, status: "untouched", valueClass: "text-destructive", cardClass: "border-border hover:border-destructive/20" },
  ]

  const openDashboard = (status: string) => {
    const params = new URLSearchParams({ from: report.windowStart, to: report.windowEnd })
    if (status) params.set("status", status)
    navigate(`/admin?${params.toString()}`)
  }

  const downloadCsv = () => {
    const rows: string[][] = [["Section", "School", "Details"]]
    for (const i of na.sentWaiting) rows.push(["Needs attention — sent, waiting", i.name, `Sent ${day(i.lastSentAt)}, waiting ${i.daysWaiting} day${i.daysWaiting === 1 ? "" : "s"}`])
    for (const i of na.notSent) rows.push(["Needs attention — not sent", i.name, `Workshop ${day(i.workshopDate)}, ${i.daysUntil} day${i.daysUntil === 1 ? "" : "s"} away`])
    for (const i of na.missingCounts) rows.push(["Needs attention — missing student counts", i.name, `${i.missing} of ${i.total} teachers missing student counts`])
    for (const i of na.conflicts) rows.push(["Needs attention — schedule conflict", i.name, i.description])
    for (const i of na.lockedWithGaps) rows.push(["Needs attention — locked with gaps", i.name, i.gaps])
    for (const i of report.comingUp) rows.push(["Coming up", i.name, `Workshop ${day(i.workshopDate)} — ${i.complete ? "everything is in" : i.stillOpen}`])
    for (const i of report.scheduledSends.items) rows.push(["Scheduled sends", i.name, `Logistics email ${day(i.sendDate)} for workshop ${day(i.workshopDate)}`])
    for (const i of report.sinceLastWeek.newAnswers) rows.push(["Since last week — schools that answered", i.name, `Now ${i.status} (${formatPacificTime(i.date)})`])
    for (const i of report.sinceLastWeek.changes) rows.push(["Since last week — changes", i.name, `${i.label}: ${i.oldValue} → ${i.newValue} (${formatPacificTime(i.at)})`])
    for (const i of report.sinceLastWeek.emailsSent) rows.push(["Since last week — emails sent", "", `${i.label} (${i.source}) — ${i.schools} school${i.schools === 1 ? "" : "s"}`])
    const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n")
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `atou-snapshot-${report.windowStart}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminLayout>
      <div className="space-y-6 pb-12 max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary mb-1">Program Operations</p>
            <h1 className="text-3xl font-serif font-bold text-foreground">Snapshot</h1>
            <p className="text-muted-foreground mt-1">
              Current as of {formatPacificTime(report.asOf)} · Covering the next {report.windowDays} days
              ({day(report.windowStart)} – {day(report.windowEnd)})
            </p>
          </div>
          <div className="flex items-center gap-2 no-print">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
            <Button variant="outline" onClick={downloadCsv}>
              <Download className="h-4 w-4 mr-2" /> Download CSV
            </Button>
          </div>
        </div>

        {/* Count tiles — click one to open the dashboard with that filter */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="group" aria-label="Workshop counts for the coming window">
          {tiles.map(tile => (
            <Card key={tile.label} className={cn("shadow-sm transition-all hover:shadow-md", tile.cardClass)}>
              <button
                type="button"
                className="w-full h-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                onClick={() => openDashboard(tile.status)}
                aria-label={`Open the dashboard filtered to ${tile.label.toLowerCase()} schools (${tile.total})`}
              >
                <CardContent className="p-5 flex flex-col justify-center items-center text-center h-full">
                  <span className={`text-4xl font-serif font-bold ${tile.valueClass}`}>{tile.total}</span>
                  <span className="text-xs font-bold uppercase tracking-widest mt-2 text-muted-foreground">{tile.label}</span>
                  <span className="text-[11px] text-muted-foreground/70 mt-0.5">{tile.sub}</span>
                </CardContent>
              </button>
            </Card>
          ))}
        </div>

        {/* Needs attention */}
        <Card className="border-t-4 border-t-destructive/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Needs attention
            </CardTitle>
            <CardDescription>
              {attentionCount === 0
                ? "Nothing needs attention right now."
                : `${attentionCount} item${attentionCount === 1 ? "" : "s"} worth a look, most urgent first.`}
            </CardDescription>
          </CardHeader>
          {attentionCount > 0 && (
            <CardContent className="space-y-5">
              {na.sentWaiting.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Sent, still waiting for answers</h3>
                  <ul className="space-y-1.5">
                    {na.sentWaiting.map(i => (
                      <li key={i.schoolId} className="text-sm">
                        <SchoolLink id={i.schoolId} name={i.name} />{" "}
                        <span className="text-muted-foreground">
                          — sent {day(i.lastSentAt)}, waiting {i.daysWaiting} day{i.daysWaiting === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {na.notSent.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Logistics email not sent yet</h3>
                  <ul className="space-y-1.5">
                    {na.notSent.map(i => (
                      <li key={i.schoolId} className="text-sm">
                        <SchoolLink id={i.schoolId} name={i.name} />{" "}
                        <span className="text-muted-foreground">
                          — workshop {day(i.workshopDate)}, only {i.daysUntil} day{i.daysUntil === 1 ? "" : "s"} away
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {na.missingCounts.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Missing student counts</h3>
                  <ul className="space-y-1.5">
                    {na.missingCounts.map(i => (
                      <li key={i.schoolId} className="text-sm">
                        <SchoolLink id={i.schoolId} name={i.name} />{" "}
                        <span className="text-muted-foreground">
                          — {i.missing} of {i.total} teacher{i.total === 1 ? "" : "s"} still missing student counts
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {na.conflicts.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Schedule conflicts</h3>
                  <ul className="space-y-1.5">
                    {na.conflicts.map(i => (
                      <li key={i.schoolId} className="text-sm">
                        <SchoolLink id={i.schoolId} name={i.name} />{" "}
                        <span className="text-muted-foreground">— {i.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {na.lockedWithGaps.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Locked, but questions are still open</h3>
                  <ul className="space-y-1.5">
                    {na.lockedWithGaps.map(i => (
                      <li key={i.schoolId} className="text-sm">
                        <SchoolLink id={i.schoolId} name={i.name} />{" "}
                        <span className="text-muted-foreground">— {i.gaps}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Coming up */}
        <Card className="border-t-4 border-t-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Coming up
            </CardTitle>
            <CardDescription>Workshops in the next {report.windowDays} days, soonest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.comingUp.length === 0 ? (
              <EmptyLine>No workshops in this window.</EmptyLine>
            ) : (
              <ul className="space-y-2.5">
                {report.comingUp.map(i => (
                  <li key={i.schoolId} className="text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium whitespace-nowrap">{day(i.workshopDate)}</span>
                      <SchoolLink id={i.schoolId} name={i.name} />
                    </div>
                    <p className={cn("text-muted-foreground ml-0.5", !i.complete && "text-amber-700")}>
                      {i.complete ? "Everything is in." : i.stillOpen}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Scheduled sends */}
        <Card className="border-t-4 border-t-secondary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-secondary" />
              Scheduled sends
            </CardTitle>
            <CardDescription>Automatic logistics emails coming up.</CardDescription>
          </CardHeader>
          <CardContent>
            {!report.scheduledSends.enabled ? (
              <EmptyLine>
                Automatic logistics emails are turned off. Turn them on under{" "}
                <Link href="/admin/settings" className="text-primary hover:underline not-italic">Settings</Link>.
              </EmptyLine>
            ) : report.scheduledSends.items.length === 0 ? (
              <EmptyLine>Nothing is scheduled to go out in this window.</EmptyLine>
            ) : (
              <ul className="space-y-1.5">
                {report.scheduledSends.items.map(i => (
                  <li key={i.schoolId} className="text-sm">
                    <span className="font-medium whitespace-nowrap">{day(i.sendDate)}</span>{" "}
                    <SchoolLink id={i.schoolId} name={i.name} />{" "}
                    <span className="text-muted-foreground">— for the workshop on {day(i.workshopDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Since last week */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Since last week
            </CardTitle>
            <CardDescription>
              What happened between {formatPacificTime(report.sinceLastWeek.from)} and {formatPacificTime(report.sinceLastWeek.to)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold mb-2">Schools that answered</h3>
              {report.sinceLastWeek.newAnswers.length === 0 ? (
                <EmptyLine>No school sent in its first answers this week.</EmptyLine>
              ) : (
                <ul className="space-y-1.5">
                  {report.sinceLastWeek.newAnswers.map(i => (
                    <li key={i.schoolId} className="text-sm">
                      <SchoolLink id={i.schoolId} name={i.name} />{" "}
                      <span className="text-muted-foreground">
                        — now {i.status} · {formatPacificTime(i.date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Changes to earlier answers</h3>
              {report.sinceLastWeek.changes.length === 0 ? (
                <EmptyLine>No earlier answers were changed this week.</EmptyLine>
              ) : (
                <ul className="space-y-2">
                  {report.sinceLastWeek.changes.map((i, idx) => (
                    <li key={`${i.schoolId}-${idx}`} className="text-sm">
                      <SchoolLink id={i.schoolId} name={i.name} />{" "}
                      <span className="text-muted-foreground">— {i.label}:</span>{" "}
                      <span className="line-through text-muted-foreground/70">{i.oldValue}</span>{" "}
                      <span aria-hidden="true">→</span>{" "}
                      <span className="font-medium">{i.newValue}</span>
                      <span className="text-xs text-muted-foreground block ml-0.5">{formatPacificTime(i.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Emails sent</h3>
              {report.sinceLastWeek.emailsSent.length === 0 ? (
                <EmptyLine>No emails went out this week.</EmptyLine>
              ) : (
                <ul className="space-y-1.5">
                  {report.sinceLastWeek.emailsSent.map((i, idx) => (
                    <li key={idx} className="text-sm">
                      <span className="font-medium">{i.label}</span>{" "}
                      <span className="text-muted-foreground">
                        ({i.source === "automatic" ? "sent automatically" : "sent by hand"}) — {i.schools} school{i.schools === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 no-print">
          <Link href="/admin">
            <Button variant="outline">
              <LayoutDashboard className="h-4 w-4 mr-2" /> Open the dashboard
            </Button>
          </Link>
        </div>
      </div>
    </AdminLayout>
  )
}
