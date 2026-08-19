import { useGetAdminSummary, useGetAdminSchools } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { StatusBadge } from "@/components/ui/status-badge"
import { formatPacificTime, cn } from "@/lib/utils"
import { Copy, Search, ExternalLink, Lock, Mail, X, CalendarDays } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "wouter"
import { useToast } from "@/hooks/use-toast"

// Dashboard view state survives a round trip to the send screen.
const DASH_STATE_KEY = "atou_dash_state"
// Selected school ids handed to the send screen.
export const SEND_SELECTION_KEY = "atou_send_selection"

type DashState = {
  search: string
  sort: string
  dateFrom: string
  dateTo: string
  sendStatus: string
  completeness: string
  summaryFilter: SummaryFilter
}

type SummaryFilter = "all" | "complete" | "partial" | "untouched" | "locked"

const DEFAULT_STATE: DashState = {
  search: "",
  sort: "date",
  dateFrom: "",
  dateTo: "",
  sendStatus: "all",
  completeness: "all",
  summaryFilter: "all",
}

function loadDashState(): DashState {
  try {
    const raw = sessionStorage.getItem(DASH_STATE_KEY)
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch { /* fall through */ }
  return DEFAULT_STATE
}

const SEND_STATUS_LABEL: Record<string, string> = {
  never_sent: "Never sent",
  sent_waiting: "Sent, waiting",
  answered: "Answered",
}

function DateFilterPicker({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div className="relative w-full sm:w-[175px]">
      <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-primary" />
      <Input
        type="date"
        aria-label={label}
        title={label}
        className="w-full pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
export function AdminDashboard() {
  const { data: summary } = useGetAdminSummary()
  const { data: schools } = useGetAdminSchools()
  const [state, setState] = useState<DashState>(loadDashState)
  const [selected, setSelected] = useState<number[]>([])
  const [, navigate] = useLocation()
  const { toast } = useToast()

  useEffect(() => {
    sessionStorage.setItem(DASH_STATE_KEY, JSON.stringify(state))
  }, [state])

  const set = (patch: Partial<DashState>) => setState(prev => ({ ...prev, ...patch }))

  const toggleSummaryFilter = (filter: SummaryFilter) => {
    setState(prev => ({
      ...prev,
      summaryFilter: filter === "all" || prev.summaryFilter === filter ? "all" : filter,
    }))
  }

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link)
    toast({ title: "Link copied to clipboard" })
  }

  const filteredSchools = useMemo(() => {
    if (!schools) return undefined
    const rows = schools.filter(s => {
      if (state.search && !s.name.toLowerCase().includes(state.search.toLowerCase())) return false
      if (state.dateFrom && (!s.workshopDate || s.workshopDate < state.dateFrom)) return false
      if (state.dateTo && (!s.workshopDate || s.workshopDate > state.dateTo)) return false
      if (state.sendStatus !== "all" && s.sendStatus !== state.sendStatus) return false
      if (state.completeness === "complete" && s.missingCount > 0) return false
      if (state.completeness === "incomplete" && s.missingCount === 0) return false
      const answeredAny = s.questionStates.some(question => question.answered)
      if (state.summaryFilter === "complete" && s.missingCount > 0) return false
      if (state.summaryFilter === "partial" && (s.missingCount === 0 || !answeredAny)) return false
      if (state.summaryFilter === "untouched" && (s.missingCount === 0 || answeredAny)) return false
      if (state.summaryFilter === "locked" && !s.locked) return false
      return true
    })
    const sendOrder: Record<string, number> = { never_sent: 0, sent_waiting: 1, answered: 2 }
    return [...rows].sort((a, b) => {
      switch (state.sort) {
        case "name":
          return a.name.localeCompare(b.name)
        case "sendStatus":
          return (sendOrder[a.sendStatus] ?? 0) - (sendOrder[b.sendStatus] ?? 0) || a.name.localeCompare(b.name)
        case "answerStatus":
          return b.missingCount - a.missingCount || a.name.localeCompare(b.name)
        default: // workshop date, soonest first; no date at the end
          return (a.workshopDate || "9999").localeCompare(b.workshopDate || "9999")
      }
    })
  }, [schools, state])

  const visibleSelectable = (filteredSchools || []).filter(s => !s.locked)
  const allVisibleSelected =
    visibleSelectable.length > 0 && visibleSelectable.every(s => selected.includes(s.id))

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(visibleSelectable.map(s => s.id))
      setSelected(prev => prev.filter(id => !visibleIds.has(id)))
    } else {
      setSelected(prev => [...new Set([...prev, ...visibleSelectable.map(s => s.id)])])
    }
  }

  const toggleSelect = (id: number) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const composeEmail = () => {
    sessionStorage.setItem(SEND_SELECTION_KEY, JSON.stringify(selected))
    navigate("/admin/send")
  }

  // Fixed order for question columns
  const questions = [
    { key: "teachers", label: "Teachers" },
    { key: "workshop_time", label: "Time" },
    { key: "activity_area", label: "Activity Area" },
    { key: "speaker_area", label: "Speaker Area" },
    { key: "notes", label: "Notes" }
  ]

  return (
    <AdminLayout>
      <div className="space-y-6 pb-20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary mb-1">Program Operations</p>
            <h1 className="text-3xl font-serif font-bold text-foreground">Workshop Dashboard</h1>
          </div>
        </div>

        {summary && (
          <div
            className="grid grid-cols-2 md:grid-cols-5 gap-4"
            role="group"
            aria-label="Filter schools by dashboard summary"
          >
            {[
              { filter: "all", label: "Total Days", total: summary.totalSchools, valueClass: "text-primary", labelClass: "text-primary/80", cardClass: "bg-primary/5 border-primary/20" },
              { filter: "complete", label: "Complete", total: summary.complete, valueClass: "text-foreground", cardClass: "border-border hover:border-primary/20" },
              { filter: "partial", label: "Partial", total: summary.partial, valueClass: "text-amber-600", cardClass: "border-border hover:border-amber-500/20" },
              { filter: "untouched", label: "Untouched", total: summary.untouched, valueClass: "text-destructive", cardClass: "border-border hover:border-destructive/20" },
              { filter: "locked", label: "Locked", total: summary.locked, valueClass: "text-secondary", labelClass: "text-secondary/80", cardClass: "bg-secondary/5 border-secondary/15 hover:border-secondary/30" },
            ].map(({ filter, label, total, valueClass = "", labelClass = "text-muted-foreground", cardClass = "" }) => {
              const active = state.summaryFilter === filter
              return (
                <Card
                  key={filter}
                  className={cn(
                    "shadow-sm transition-all hover:shadow-md",
                    cardClass,
                    active && "border-primary bg-primary/10 ring-2 ring-primary ring-offset-2",
                  )}
                >
                  <button
                    type="button"
                    className="w-full h-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    onClick={() => toggleSummaryFilter(filter as SummaryFilter)}
                    aria-pressed={active}
                    aria-label={`${active ? "Clear" : "Filter by"} ${label} schools (${total})`}
                  >
                    <CardContent className="p-5 flex flex-col justify-center items-center text-center h-full">
                      <span className={`text-4xl font-serif font-bold ${valueClass}`}>{total}</span>
                      <span className={`text-xs font-bold uppercase tracking-widest mt-2 ${labelClass}`}>{label}</span>
                    </CardContent>
                  </button>
                </Card>
              )
            })}
          </div>
        )}

        <div className="bg-white p-5 rounded-xl border border-border space-y-4 shadow-[0_8px_28px_-22px_rgba(24,48,89,0.45)]">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search schools..."
                className="pl-9"
                value={state.search}
                onChange={(e) => set({ search: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Sort by</span>
              <Select value={state.sort} onValueChange={(v) => set({ sort: v })}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Workshop date</SelectItem>
                  <SelectItem value="name">School name</SelectItem>
                  <SelectItem value="sendStatus">Send status</SelectItem>
                  <SelectItem value="answerStatus">Answer status</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Workshop between</span>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:flex items-center gap-2 w-full sm:w-auto">
                <DateFilterPicker
                  label="Earliest workshop date"
                  value={state.dateFrom}
                  onChange={(dateFrom) => set({ dateFrom })}
                />
                <span className="text-sm text-muted-foreground">and</span>
                <DateFilterPicker
                  label="Latest workshop date"
                  value={state.dateTo}
                  onChange={(dateTo) => set({ dateTo })}
                />
              </div>
            </div>
            <Select value={state.sendStatus} onValueChange={(v) => set({ sendStatus: v })}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any send status</SelectItem>
                <SelectItem value="never_sent">Never sent</SelectItem>
                <SelectItem value="sent_waiting">Sent and waiting</SelectItem>
                <SelectItem value="answered">Answered</SelectItem>
              </SelectContent>
            </Select>
            <Select value={state.completeness} onValueChange={(v) => set({ completeness: v })}>
              <SelectTrigger className="w-full sm:w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any answer status</SelectItem>
                <SelectItem value="complete">All answers in</SelectItem>
                <SelectItem value="incomplete">Missing answers</SelectItem>
              </SelectContent>
            </Select>
            {(state.search || state.dateFrom || state.dateTo || state.sendStatus !== "all" || state.completeness !== "all" || state.summaryFilter !== "all" || state.sort !== "date") && (
              <Button variant="ghost" size="sm" onClick={() => setState(DEFAULT_STATE)}>
                <X className="h-4 w-4 mr-1" /> Reset
              </Button>
            )}
          </div>
        </div>

        <TooltipProvider>
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleSelectAll}
                    disabled={visibleSelectable.length === 0}
                    aria-label="Select all visible schools"
                  />
                </TableHead>
                <TableHead className="w-[230px] font-semibold text-foreground">School</TableHead>
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead className="w-[130px]">Send Status</TableHead>
                <TableHead className="w-[90px]">Approx # Students</TableHead>
                {questions.map(q => (
                  <TableHead key={q.key} className="min-w-[110px]">{q.label}</TableHead>
                ))}
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSchools?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-16">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        <Search className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <p className="text-muted-foreground font-medium">No schools match your search and filters.</p>
                      {(state.search || state.dateFrom || state.dateTo || state.sendStatus !== "all" || state.completeness !== "all" || state.summaryFilter !== "all" || state.sort !== "date") && (
                        <Button variant="outline" size="sm" onClick={() => setState(DEFAULT_STATE)}>
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredSchools?.map((school) => (
                <TableRow key={school.id} className={cn("group transition-colors", school.locked ? "bg-muted/10" : "hover:bg-muted/30")}>
                  <TableCell>
                    {school.locked ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex"><Lock className="h-4 w-4 text-muted-foreground" /></span>
                        </TooltipTrigger>
                        <TooltipContent>Edits are locked for this school, so it can't be selected.</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Checkbox
                        checked={selected.includes(school.id)}
                        onCheckedChange={() => toggleSelect(school.id)}
                        aria-label={`Select ${school.name}`}
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/schools/${school.id}`} className="text-primary hover:underline">
                        {school.name}
                      </Link>
                    </div>
                    {school.missingCount > 0 && (
                      <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                        Missing {school.missingCount}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {school.workshopDate ? formatPacificTime(school.workshopDate).split(',')[0] : "TBD"}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      {SEND_STATUS_LABEL[school.sendStatus] || school.sendStatus}
                      {school.lastSentAt && (
                        <div className="text-muted-foreground mt-0.5">
                          {formatPacificTime(school.lastSentAt).split(',')[0]}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {school.approxStudents || <span className="text-muted-foreground/50">—</span>}
                  </TableCell>

                  {questions.map(q => {
                    const state = school.questionStates.find(s => s.questionKey === q.key)
                    return (
                      <TableCell key={q.key}>
                        {state?.answered ? (
                          <div className="text-xs text-muted-foreground truncate max-w-[150px]" title={state.summary || ""}>
                            {state.summary || <StatusBadge complete={true} text="Done" />}
                          </div>
                        ) : (
                          q.key === "notes" ? <span className="text-xs text-muted-foreground/50">Optional</span> : <StatusBadge complete={false} text="Missing" />
                        )}
                      </TableCell>
                    )
                  })}

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-muted" onClick={() => copyLink(school.link)} title="Copy Portal Link">
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Link href={`/admin/schools/${school.id}`}>
                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-primary/10" title="View Form">
                          <ExternalLink className="h-4 w-4 text-primary" />
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        </TooltipProvider>

        {selected.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-brand-navy/20 bg-brand-navy/95 text-white backdrop-blur px-4 py-3 no-print shadow-2xl">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
              <div className="text-sm font-medium">
                {selected.length} school{selected.length === 1 ? "" : "s"} selected
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setSelected([])}>Clear</Button>
                <Button size="sm" onClick={composeEmail}>
                  <Mail className="h-4 w-4 mr-2" /> Compose email
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
