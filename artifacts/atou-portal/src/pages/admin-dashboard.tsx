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
import { formatPacificTime } from "@/lib/utils"
import { Copy, Search, ExternalLink, Lock, Mail, X } from "lucide-react"
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
}

const DEFAULT_STATE: DashState = {
  search: "",
  sort: "date",
  dateFrom: "",
  dateTo: "",
  sendStatus: "all",
  completeness: "all",
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
          <h1 className="text-2xl font-serif font-semibold text-foreground">Workshop Dashboard</h1>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="bg-primary/5 border-primary/10">
              <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                <span className="text-3xl font-serif font-semibold text-primary">{summary.totalSchools}</span>
                <span className="text-xs font-medium text-primary/80 uppercase tracking-wider mt-1">Total Days</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                <span className="text-3xl font-serif font-semibold">{summary.complete}</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Complete</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                <span className="text-3xl font-serif font-semibold text-amber-600">{summary.partial}</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Partial</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                <span className="text-3xl font-serif font-semibold text-destructive">{summary.untouched}</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Untouched</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                <span className="text-3xl font-serif font-semibold">{summary.locked}</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Locked</span>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="bg-card p-4 rounded-lg border space-y-3">
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
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Workshop between</span>
              <Input
                type="date"
                className="w-[150px]"
                value={state.dateFrom}
                onChange={(e) => set({ dateFrom: e.target.value })}
              />
              <span className="text-sm text-muted-foreground">and</span>
              <Input
                type="date"
                className="w-[150px]"
                value={state.dateTo}
                onChange={(e) => set({ dateTo: e.target.value })}
              />
            </div>
            <Select value={state.sendStatus} onValueChange={(v) => set({ sendStatus: v })}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any send status</SelectItem>
                <SelectItem value="never_sent">Never sent</SelectItem>
                <SelectItem value="sent_waiting">Sent and waiting</SelectItem>
                <SelectItem value="answered">Answered</SelectItem>
              </SelectContent>
            </Select>
            <Select value={state.completeness} onValueChange={(v) => set({ completeness: v })}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any answer status</SelectItem>
                <SelectItem value="complete">All answers in</SelectItem>
                <SelectItem value="incomplete">Missing answers</SelectItem>
              </SelectContent>
            </Select>
            {(state.search || state.dateFrom || state.dateTo || state.sendStatus !== "all" || state.completeness !== "all" || state.sort !== "date") && (
              <Button variant="ghost" size="sm" onClick={() => setState(DEFAULT_STATE)}>
                <X className="h-4 w-4 mr-1" /> Reset
              </Button>
            )}
          </div>
        </div>

        <TooltipProvider>
        <Card className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
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
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    No schools match your search and filters.
                  </TableCell>
                </TableRow>
              ) : filteredSchools?.map((school) => (
                <TableRow key={school.id} className={school.locked ? "bg-muted/10" : ""}>
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
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => copyLink(school.link)} title="Copy Portal Link">
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Link href={`/admin/schools/${school.id}`}>
                        <Button variant="ghost" size="icon" title="View Form">
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
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur px-4 py-3 no-print">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
              <div className="text-sm font-medium">
                {selected.length} school{selected.length === 1 ? "" : "s"} selected
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button>
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
