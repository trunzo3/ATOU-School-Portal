import {
  useGetAdminSchools,
  useGetEmailTemplate,
  useUpdateEmailTemplate,
  useGetEmailSends,
  useGetEmailStatus,
  useSendEmails,
  getGetEmailSendsQueryKey,
  getGetAdminSchoolsQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { AtouLogo } from "@/components/shared/atou-logo"
import { EmailSignaturePreview } from "@/components/shared/email-signature-preview"
import { formatPacificTime } from "@/lib/utils"
import { ChevronLeft, Eye, EyeOff, Mail, Save, Search, Send, X, AlertCircle, CheckCircle2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "wouter"
import { useToast } from "@/hooks/use-toast"
import { SEND_SELECTION_KEY } from "./admin-dashboard"

// Client-side copy of the server's merge-field rules, for the preview.
function fillMergeFields(
  template: string,
  school: { name: string; workshopDate: string | null; link: string },
): string {
  const dateText = school.workshopDate
    ? new Date(`${school.workshopDate}T12:00:00-08:00`).toLocaleDateString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "TBD"
  return template
    .replaceAll("{{school_name}}", school.name)
    .replaceAll("{{workshop_date}}", dateText)
    .replaceAll("{{link}}", school.link)
}

export function AdminSend() {
  const { data: schools } = useGetAdminSchools()
  const { data: template } = useGetEmailTemplate()
  const { data: sends } = useGetEmailSends()
  const { data: emailStatus } = useGetEmailStatus()
  const updateTemplate = useUpdateEmailTemplate()
  const sendEmails = useSendEmails()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // schoolId -> selected recipient emails
  const [selection, setSelection] = useState<Record<number, string[]>>({})
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [templateLoaded, setTemplateLoaded] = useState(false)
  const editedRef = useRef(false)
  const [showPreview, setShowPreview] = useState(false)
  const [addQuery, setAddQuery] = useState("")
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const consumedRef = useRef(false)

  // Prefill subject/message from the saved template once — but never over
  // something the user already started typing.
  useEffect(() => {
    if (template && !templateLoaded) {
      setTemplateLoaded(true)
      if (!editedRef.current) {
        setSubject(template.subject)
        setMessage(template.body)
      }
    }
  }, [template, templateLoaded])

  // Consume the selection handed over from the dashboard (or school detail).
  useEffect(() => {
    if (!schools || consumedRef.current) return
    consumedRef.current = true
    try {
      const raw = sessionStorage.getItem(SEND_SELECTION_KEY)
      if (!raw) return
      sessionStorage.removeItem(SEND_SELECTION_KEY)
      const ids: number[] = JSON.parse(raw)
      const next: Record<number, string[]> = {}
      for (const id of ids) {
        const school = schools.find(s => s.id === id)
        // A school locked since it was selected is dropped here.
        if (school && !school.locked) next[id] = school.contacts.map(c => c.email)
      }
      setSelection(next)
    } catch { /* start empty */ }
  }, [schools])

  const selectedIds = Object.keys(selection).map(Number)
  const selectedSchools = (schools || []).filter(s => selectedIds.includes(s.id))
  const recipientCount = selectedIds.reduce((sum, id) => sum + (selection[id]?.length || 0), 0)

  const addSchool = (id: number, emails?: string[]) => {
    const school = schools?.find(s => s.id === id)
    if (!school || school.locked) return
    setSelection(prev => ({
      ...prev,
      [id]: emails ?? school.contacts.map(c => c.email),
    }))
    setAddQuery("")
  }

  const removeSchool = (id: number) => {
    setSelection(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const removeEmail = (id: number, email: string) => {
    setSelection(prev => ({ ...prev, [id]: (prev[id] || []).filter(e => e !== email) }))
  }

  const matches = addQuery.trim().length > 0
    ? (schools || [])
        .filter(s => !s.locked && !selectedIds.includes(s.id))
        .filter(s => s.name.toLowerCase().includes(addQuery.trim().toLowerCase()))
        .slice(0, 8)
    : []

  const handleSaveTemplate = () => {
    updateTemplate.mutate({ data: { subject, body: message } }, {
      onSuccess: () => toast({ title: "Saved as the default template" }),
    })
  }

  const previewSchool = selectedSchools[0]

  const handleSend = () => {
    const items = selectedIds
      .map(id => ({ schoolId: id, emails: selection[id] || [] }))
      .filter(i => i.emails.length > 0)
    if (items.length === 0) return
    setConfirmation(null)
    sendEmails.mutate({ data: { items, subject, message } }, {
      onSuccess: (result) => {
        const n = result.sends.length
        const m = result.sends.reduce((sum, s) => sum + s.recipients.length, 0)
        setConfirmation(
          result.configured && result.enabled
            ? `Sent to ${n} school${n === 1 ? "" : "s"} (${m} recipient${m === 1 ? "" : "s"}).`
            : `Recorded ${n} send${n === 1 ? "" : "s"} (${m} recipient${m === 1 ? "" : "s"}) in the log. No emails were delivered because live email sending is off.`
        )
        if (result.errors.length > 0) {
          toast({ title: "Some sends had problems", description: result.errors.join(" "), variant: "destructive" })
        }
        setSelection({})
        setShowPreview(false)
        queryClient.invalidateQueries({ queryKey: getGetEmailSendsQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetAdminSchoolsQueryKey() })
      },
      onError: () => {
        toast({ title: "Sending failed", description: "Nothing was sent. Please try again.", variant: "destructive" })
      },
    })
  }

  const resend = (schoolId: number, recipients: string[]) => {
    const school = schools?.find(s => s.id === schoolId)
    if (!school) return
    // Keep only addresses that are still contacts, fall back to current contacts.
    const stillValid = recipients.filter(r => school.contacts.some(c => c.email === r))
    addSchool(schoolId, stillValid.length > 0 ? stillValid : undefined)
    setConfirmation(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const hasSelection = selectedIds.length > 0

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl pb-12">
        <div>
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back to schools
            </Button>
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary mb-1">School Communications</p>
          <h1 className="text-3xl font-serif font-bold text-foreground">Send Emails</h1>
        </div>

        {emailStatus && !emailStatus.configured && (
          <div role="status" className="bg-amber-50 border-amber-200 border text-amber-950 p-4 rounded-xl flex items-start gap-3 no-print">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold mb-1">Email sending isn't connected yet.</p>
              <p>Sends will be recorded in the log below, but no emails will actually be delivered until the Resend connection is set up.</p>
            </div>
          </div>
        )}

        {emailStatus?.configured && !emailStatus.enabled && (
          <div role="status" className="bg-amber-50 border-amber-200 border text-amber-950 p-4 rounded-xl flex items-start gap-3 no-print">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold mb-1">Live email sending is off.</p>
              <p>Resend is connected, but the Settings switch is off. Sends will be recorded below without delivering email.</p>
            </div>
          </div>
        )}

        {confirmation && (
          <div role="status" className="bg-primary/10 border-primary/20 border text-foreground p-4 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <p className="text-sm font-medium">{confirmation}</p>
          </div>
        )}

        {/* Compose */}
        <Card className="border-t-4 border-t-primary shadow-[0_10px_30px_-24px_rgba(24,48,89,0.55)]">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Compose</CardTitle>
            {!hasSelection && (
              <CardDescription>
                No schools are selected yet. Add schools by name below, or pick them on the dashboard and click Compose email.
              </CardDescription>
            )}
            </div>
            <AtouLogo className="h-14 w-14 flex-shrink-0" />
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Type-ahead to add schools */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Add a school by name..."
                className="pl-9"
                value={addQuery}
                onChange={e => setAddQuery(e.target.value)}
              />
              {matches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-popover border rounded-lg shadow-xl overflow-hidden">
                  {matches.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      onClick={() => addSchool(m.id)}
                    >
                      {m.name}
                      <span className="text-muted-foreground text-xs ml-2">
                        {m.workshopDate ? formatPacificTime(m.workshopDate).split(',')[0] : "Date TBD"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected schools with removable addresses */}
            {hasSelection && (
              <div className="space-y-3">
                {selectedSchools.map(school => (
                  <div key={school.id} className="border rounded-xl p-4 bg-muted/20">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-medium">{school.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {school.workshopDate ? formatPacificTime(school.workshopDate).split(',')[0] : "Date TBD"}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeSchool(school.id)} title={`Remove ${school.name}`}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(selection[school.id] || []).length === 0 ? (
                        <span className="text-xs text-destructive">No addresses left — this school will be skipped.</span>
                      ) : (
                        (selection[school.id] || []).map(email => (
                          <span key={email} className="inline-flex items-center gap-1 bg-muted rounded-full pl-3 pr-1 py-0.5 text-xs">
                            {email}
                            <button
                              type="button"
                              className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                              onClick={() => removeEmail(school.id, email)}
                              aria-label={`Remove ${email}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Subject and message */}
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input id="email-subject" value={subject} onChange={e => { editedRef.current = true; setSubject(e.target.value) }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-message">Message</Label>
              <Textarea
                id="email-message"
                value={message}
                onChange={e => { editedRef.current = true; setMessage(e.target.value) }}
                className="min-h-[260px]"
              />
              <p className="text-xs text-muted-foreground">
                {"{{school_name}}"}, {"{{workshop_date}}"}, and {"{{link}}"} are filled in automatically for each school.
                Pam's ATOU signature is added automatically at the end of every email.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleSend}
                disabled={!hasSelection || recipientCount === 0 || sendEmails.isPending || !subject.trim() || !message.trim()}
                className="shadow-sm"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendEmails.isPending
                  ? "Sending..."
                  : `Send to ${selectedIds.length} school${selectedIds.length === 1 ? "" : "s"} (${recipientCount} recipient${recipientCount === 1 ? "" : "s"})`}
              </Button>
              {previewSchool && (
                <Button variant="outline" onClick={() => setShowPreview(p => !p)}>
                  {showPreview ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  {showPreview ? "Hide preview" : "Preview"}
                </Button>
              )}
              <Button variant="outline" onClick={handleSaveTemplate} disabled={updateTemplate.isPending || !subject.trim() || !message.trim()}>
                <Save className="h-4 w-4 mr-2" />
                Save as template
              </Button>
            </div>

            {showPreview && previewSchool && (
              <div className="border border-secondary/20 rounded-xl p-5 bg-secondary/5 space-y-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Preview for {previewSchool.name}
                </p>
                <div>
                  <span className="text-xs text-muted-foreground block">Subject</span>
                  <p className="text-sm font-medium">{fillMergeFields(subject, previewSchool)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Message</span>
                  <p className="text-sm whitespace-pre-wrap">{fillMergeFields(message, previewSchool)}</p>
                </div>
                <div className="border-t border-secondary/20 pt-3">
                  <span className="text-xs text-muted-foreground block mb-2">Signature (added automatically)</span>
                  <EmailSignaturePreview cancellationPolicyUrl={emailStatus?.cancellationPolicyUrl} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sent log */}
        <Card className="border-t-4 border-t-secondary">
          <CardHeader>
            <CardTitle>Sent Log</CardTitle>
            <CardDescription>Past sends, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {!sends || sends.length === 0 ? (
              <p className="text-muted-foreground bg-muted/20 p-12 rounded-xl text-center border border-dashed border-border/60">
                Nothing has been sent yet.
              </p>
            ) : (
              <div className="divide-y">
                {sends.map(send => (
                  <div key={send.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/admin/schools/${send.schoolId}`} className="font-medium text-primary hover:underline">
                          {send.schoolName}
                        </Link>
                        <Badge variant={send.isFollowUp ? "secondary" : "default"}>
                          {send.isFollowUp ? "Follow-up" : "First send"}
                        </Badge>
                        {!send.delivered && (
                          <Badge variant="outline" className="text-amber-700 border-amber-300">Not delivered</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 break-words">
                        To: {send.recipients.join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatPacificTime(send.sentAt)} · by {send.sentBy}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="border-secondary/35 text-secondary hover:bg-secondary hover:text-secondary-foreground" onClick={() => resend(send.schoolId, send.recipients)}>
                      <Mail className="h-4 w-4 mr-2" /> Resend
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
