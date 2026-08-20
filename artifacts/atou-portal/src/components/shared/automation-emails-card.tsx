import {
  useGetAutomationSettings,
  getGetAutomationSettingsQueryKey,
  useUpdateAutoLogistics,
  useUpdateWeeklySummary,
  useSendWeeklySummaryNow,
  useGetEmailTemplates,
  useGetEmailStatus,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { formatPacificTime } from "@/lib/utils"
import { Zap, Send } from "lucide-react"

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function apiErrorText(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: unknown }).data
    if (typeof data === "object" && data !== null && "error" in data &&
        typeof (data as { error?: unknown }).error === "string") {
      return (data as { error: string }).error
    }
  }
  return fallback
}

// Turn free-typed recipient text into a clean list of addresses.
function parseRecipients(text: string): string[] {
  return [...new Set(
    text
      .split(/[\s,;]+/)
      .map(t => t.trim())
      .filter(t => t.includes("@") && t.includes(".")),
  )]
}

// The Add/Edit form for one rule: a template pick and a send day. Only the
// templates not used by another rule are offered.
function RuleForm(props: {
  pickableTemplates: Array<{ id: string; name: string }>
  templateId: string
  onTemplateChange: (id: string) => void
  days: string
  onDaysChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <div className="rounded-lg border-2 border-primary/40 p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="rule-template">Email template</Label>
          <Select value={props.templateId} onValueChange={props.onTemplateChange}>
            <SelectTrigger id="rule-template">
              <SelectValue placeholder="Choose a template..." />
            </SelectTrigger>
            <SelectContent>
              {props.pickableTemplates.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-days">Days before the workshop</Label>
          <Input
            id="rule-days"
            type="number"
            min={1}
            max={365}
            value={props.days}
            onChange={e => props.onDaysChange(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={props.onSave} disabled={props.saving}>
          {props.saving ? "Saving..." : "Save rule"}
        </Button>
        <Button variant="outline" size="sm" onClick={props.onCancel} disabled={props.saving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function AutomationEmailsCard() {
  const { data: auto } = useGetAutomationSettings({ query: { queryKey: getGetAutomationSettingsQueryKey() } })
  const { data: templates } = useGetEmailTemplates()
  const { data: emailStatus } = useGetEmailStatus()
  const updateLogistics = useUpdateAutoLogistics()
  const updateWeekly = useUpdateWeeklySummary()
  const sendNow = useSendWeeklySummaryNow()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Logistics block: a list of saved rules; the form only opens for Add/Edit.
  // editIndex is the rule being edited, or null when adding a new one.
  const [formOpen, setFormOpen] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [formTemplateId, setFormTemplateId] = useState("")
  const [formDays, setFormDays] = useState("60")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")

  // Weekly block
  const [dayOfWeek, setDayOfWeek] = useState("1")
  const [daysAhead, setDaysAhead] = useState("30")
  const [recipientsText, setRecipientsText] = useState("")

  useEffect(() => {
    if (!auto) return
    setDayOfWeek(String(auto.weekly.dayOfWeek))
    setDaysAhead(String(auto.weekly.daysAhead))
    setRecipientsText(auto.weekly.recipients.join("\n"))
  }, [auto])

  if (!auto) return null

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetAutomationSettingsQueryKey() })

  const rules = auto.logistics.rules
  const templateName = (id: string) =>
    (templates || []).find(t => t.id === id)?.name ?? "Email template"
  const usedTemplateIds = new Set(rules.map(r => r.templateId))
  // While editing, the rule's own template stays pickable; otherwise only unused ones.
  const pickableTemplates = (templates || []).filter(
    t => !usedTemplateIds.has(t.id) || (editIndex !== null && rules[editIndex]?.templateId === t.id),
  )

  const saveLogistics = (nextRules: typeof rules, enabled: boolean, note: string, onDone?: () => void) => {
    updateLogistics.mutate({ data: { enabled, rules: nextRules } }, {
      onSuccess: () => {
        refresh()
        toast({ title: note })
        onDone?.()
      },
      onError: (error) => {
        toast({
          title: "Could not save",
          description: apiErrorText(error, "The automatic email settings were not changed."),
          variant: "destructive",
        })
      },
    })
  }

  const openAddForm = () => {
    const firstFree = (templates || []).find(t => !usedTemplateIds.has(t.id))
    setEditIndex(null)
    setFormTemplateId(firstFree?.id ?? "")
    setFormDays(firstFree?.id.includes("follow") ? "30" : "60")
    setFormOpen(true)
  }

  const openEditForm = (index: number) => {
    const rule = rules[index]
    if (!rule) return
    setEditIndex(index)
    setFormTemplateId(rule.templateId)
    setFormDays(String(rule.daysBefore))
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditIndex(null)
  }

  const handleSaveRule = () => {
    if (!formTemplateId) {
      toast({ title: "Pick an email template first", variant: "destructive" })
      return
    }
    const rule = {
      templateId: formTemplateId,
      daysBefore: Math.max(1, Math.min(365, parseInt(formDays, 10) || 60)),
    }
    const nextRules = editIndex === null
      ? [...rules, rule]
      : rules.map((r, i) => (i === editIndex ? rule : r))
    saveLogistics(nextRules, auto.logistics.enabled, "Rule saved", closeForm)
  }

  const handleDeleteRule = (index: number) => {
    const nextRules = rules.filter((_, i) => i !== index)
    const stillEnabled = nextRules.length > 0 && auto.logistics.enabled
    saveLogistics(
      nextRules,
      stillEnabled,
      auto.logistics.enabled && !stillEnabled
        ? "Rule deleted — automatic emails are off"
        : "Rule deleted",
      closeForm,
    )
  }

  const weeklyBody = (enabled: boolean) => ({
    enabled,
    dayOfWeek: Math.max(0, Math.min(6, parseInt(dayOfWeek, 10) || 0)),
    daysAhead: Math.max(1, Math.min(365, parseInt(daysAhead, 10) || 30)),
    recipients: parseRecipients(recipientsText),
  })

  const saveWeekly = (enabled: boolean, note?: string) => {
    updateWeekly.mutate({ data: weeklyBody(enabled) }, {
      onSuccess: () => {
        refresh()
        toast({ title: note ?? "Weekly summary settings updated" })
      },
      onError: (error) => {
        toast({
          title: "Could not save",
          description: apiErrorText(error, "The weekly summary settings were not changed."),
          variant: "destructive",
        })
      },
    })
  }

  const handleLogisticsToggle = (on: boolean) => {
    if (on) {
      setConfirmText("")
      setConfirmOpen(true)
    } else {
      saveLogistics(rules, false, "Automatic logistics emails are off")
    }
  }

  // The CONFIRM dialog spells out exactly what turning it on means.
  const ruleSentences = rules
    .map(r => `the "${templateName(r.templateId)}" email goes out ${r.daysBefore} day${r.daysBefore === 1 ? "" : "s"} before each workshop`)
    .join(", and ")

  const handleWeeklyToggle = (on: boolean) => {
    if (on && parseRecipients(recipientsText).length === 0) {
      toast({
        title: "Add a recipient first",
        description: "The weekly summary needs at least one email address to send to.",
        variant: "destructive",
      })
      return
    }
    saveWeekly(on, on ? "Weekly summary email is on" : "Weekly summary email is off")
  }

  const handleSendNow = () => {
    sendNow.mutate(undefined, {
      onSuccess: () => {
        refresh()
        toast({ title: "Weekly summary sent", description: "Check the recipients' inboxes in a moment." })
      },
      onError: (error) => {
        toast({
          title: "Could not send",
          description: apiErrorText(error, "The weekly summary was not sent."),
          variant: "destructive",
        })
      },
    })
  }

  const logisticsBlocked = !emailStatus?.configured || !emailStatus?.enabled

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Automatic Emails
        </CardTitle>
        <CardDescription>
          Let the app send routine emails on its own. Both are off unless you turn them on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Logistics requests: a list of saved rules, edited one at a time */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">Logistics requests to schools</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Each school gets its logistics email automatically, a set number of days
                before its workshop.{rules.length === 0 && " Add a rule to begin."}
              </p>
            </div>
            {rules.length > 0 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Switch
                  aria-label="Automatic logistics emails"
                  checked={auto.logistics.enabled}
                  onCheckedChange={handleLogisticsToggle}
                  disabled={updateLogistics.isPending}
                />
                <span className="text-sm font-medium">{auto.logistics.enabled ? "On" : "Off"}</span>
              </div>
            )}
          </div>

          {auto.logistics.enabled && logisticsBlocked && (
            <p className="text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-950 p-3">
              This is turned on, but nothing will go out until Resend is connected and the
              live email sending switch above is on.
            </p>
          )}

          {rules.map((rule, index) => (
            formOpen && editIndex === index ? (
              <RuleForm
                key={rule.templateId}
                pickableTemplates={pickableTemplates}
                templateId={formTemplateId}
                onTemplateChange={setFormTemplateId}
                days={formDays}
                onDaysChange={setFormDays}
                onSave={handleSaveRule}
                onCancel={closeForm}
                saving={updateLogistics.isPending}
              />
            ) : (
              <div
                key={rule.templateId}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
              >
                <div className={formOpen ? "opacity-50" : undefined}>
                  <span className="font-medium">{templateName(rule.templateId)}</span>
                  <p className="text-sm text-muted-foreground">
                    Sends {rule.daysBefore} day{rule.daysBefore === 1 ? "" : "s"} before the workshop
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditForm(index)}
                    disabled={formOpen || updateLogistics.isPending}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteRule(index)}
                    disabled={formOpen || updateLogistics.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )
          ))}

          {formOpen && editIndex === null && (
            <RuleForm
              pickableTemplates={pickableTemplates}
              templateId={formTemplateId}
              onTemplateChange={setFormTemplateId}
              days={formDays}
              onDaysChange={setFormDays}
              onSave={handleSaveRule}
              onCancel={closeForm}
              saving={updateLogistics.isPending}
            />
          )}

          {!formOpen && rules.length < Math.min(2, templates?.length ?? 2) && (
            <Button variant="outline" size="sm" onClick={openAddForm}>
              + Add a rule
            </Button>
          )}
          {rules.length >= Math.min(2, templates?.length ?? 2) && (
            <p className="text-sm text-muted-foreground">
              Both templates are in use. Delete a rule to add a different one.
            </p>
          )}
        </div>

        <div className="border-t" />

        {/* Weekly summary */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">Weekly summary for the team</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                A snapshot of upcoming workshops and open questions, emailed once a week.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Switch
                aria-label="Weekly summary email"
                checked={auto.weekly.enabled}
                onCheckedChange={handleWeeklyToggle}
                disabled={updateWeekly.isPending}
              />
              <span className="text-sm font-medium">{auto.weekly.enabled ? "On" : "Off"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="weekly-day">Send it every</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger id="weekly-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((name, i) => (
                    <SelectItem key={name} value={String(i)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="weekly-days-ahead">How many days it looks ahead</Label>
              <Input
                id="weekly-days-ahead"
                type="number"
                min={1}
                max={365}
                value={daysAhead}
                onChange={e => setDaysAhead(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="weekly-recipients">Send it to</Label>
            <Textarea
              id="weekly-recipients"
              placeholder={"pam@example.org\nassistant@example.org"}
              className="min-h-[80px]"
              value={recipientsText}
              onChange={e => setRecipientsText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              One address per line (commas work too).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveWeekly(auto.weekly.enabled)}
              disabled={updateWeekly.isPending}
            >
              Save weekly settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendNow}
              disabled={sendNow.isPending || parseRecipients(recipientsText).length === 0}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendNow.isPending ? "Sending..." : "Send now"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {auto.weekly.lastSentAt
              ? `Last sent ${formatPacificTime(auto.weekly.lastSentAt)}.`
              : "It hasn't been sent yet."}
          </p>
        </div>
      </CardContent>

      {/* Type CONFIRM before real school emails start going out on their own */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on automatic school emails?</AlertDialogTitle>
            <AlertDialogDescription>
              Once this is on, the app will email schools by itself — {ruleSentences}.
              Type CONFIRM below to turn it on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1">
            <Input
              aria-label="Type CONFIRM to enable"
              placeholder="CONFIRM"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep it off</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              disabled={confirmText.trim() !== "CONFIRM"}
              onClick={() => {
                setConfirmOpen(false)
                saveLogistics(rules, true, "Automatic logistics emails are on")
              }}
            >
              Turn it on
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
