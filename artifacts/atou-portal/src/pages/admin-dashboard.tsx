import { useGetAdminSummary, useGetAdminSchools } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/ui/status-badge"
import { formatPacificTime } from "@/lib/utils"
import { Copy, Search, ExternalLink, Lock } from "lucide-react"
import { useState } from "react"
import { Link } from "wouter"
import { useToast } from "@/hooks/use-toast"

export function AdminDashboard() {
  const { data: summary } = useGetAdminSummary()
  const { data: schools } = useGetAdminSchools()
  const [filterMissing, setFilterMissing] = useState(false)
  const [search, setSearch] = useState("")
  const { toast } = useToast()

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link)
    toast({ title: "Link copied to clipboard" })
  }

  const filteredSchools = schools?.filter(s => {
    if (filterMissing && s.missingCount === 0) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

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
      <div className="space-y-6">
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

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-card p-4 rounded-lg border">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search schools..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="filter-missing"
              checked={filterMissing}
              onCheckedChange={setFilterMissing}
            />
            <Label htmlFor="filter-missing" className="cursor-pointer">Only show missing answers</Label>
          </div>
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[250px] font-semibold text-foreground">School</TableHead>
                <TableHead className="w-[120px]">Date</TableHead>
                <TableHead className="w-[90px]">Approx # Students</TableHead>
                {questions.map(q => (
                  <TableHead key={q.key} className="min-w-[120px]">{q.label}</TableHead>
                ))}
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSchools?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No schools match your search.
                  </TableCell>
                </TableRow>
              ) : filteredSchools?.map((school) => (
                <TableRow key={school.id} className={school.locked ? "bg-muted/10" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/schools/${school.id}`} className="text-primary hover:underline">
                        {school.name}
                      </Link>
                      {school.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
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
      </div>
    </AdminLayout>
  )
}