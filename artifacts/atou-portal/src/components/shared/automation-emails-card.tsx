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

export function AutomationEmailsCard() {
  const { data: auto } = useGetAutomationSettings({ query: { queryKey: getGetAutomationSettingsQueryKey() } })
  const { data: templates } = useGetEmailTemplates()
  const { data: emailStatus } = useGetEmailStatus()
  const updateLogistics = useUpdateAutoLogistics()
  const updateWeekly = useUpdateWeeklySummary()
  const sendNow = useSendWeeklySummaryNow()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Logistics block
  const [daysBefore, setDaysBefore] = useState("60")
  const [templateId, setTemplateId] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")

  // Weekly block
  const [dayOfWeek, setDayOfWeek] = useState("1")
  const [daysAhead, setDaysAhead] = useState("30")
  const [recipientsText, setRecipientsText] = useState("")

  useEffect(() => {
    if (!auto) return
    setDaysBefore(String(auto.logistics.daysBefore))
    setTemplateId(auto.logistics.templateId)
    setDayOfWeek(String(auto.weekly.dayOfWeek))
    setDaysAhead(String(auto.weekly.daysAhead))
    setRecipientsText(auto.weekly.recipients.join("\n"))
  }, [auto])

  if (!auto) return null

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetAutomationSettingsQueryKey() })

  const logisticsBody = (enabled: boolean) => ({
    enabled,
    daysBefore: Math.max(1, Math.min(365, parseInt(daysBefore, 10) || 60)),
    // Fall back to the first template so the CONFIRM flow can't save an empty pick.
    templateId: templateId || templates?.[0]?.id || "",
  })

  const saveLogistics = (enabled: boolean, note?: string) => {
    updateLogistics.mutate({ data: logisticsBody(enabled) }, {
      onSuccess: () => {
        refresh()
        toast({ title: note ?? "Automatic logistics emails updated" })
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
      saveLogistics(false, "Automatic logistics emails are off")
    }
  }

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
        {/* Logistics requests */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">Logistics requests to schools</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Each school gets its first logistics email automatically, a set number of days
                before its workshop. Only schools that have never been emailed are included.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Switch
                aria-label="Automatic logistics emails"
                checked={auto.logistics.enabled}
                onCheckedChange={handleLogisticsToggle}
                disabled={updateLogistics.isPending}
              />
              <span className="text-sm font-medium">{auto.logistics.enabled ? "On" : "Off"}</span>
            </div>
          </div>

          {auto.logistics.enabled && logisticsBlocked && (
            <p className="text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-950 p-3">
              This is turned on, but nothing will go out until Resend is connected and the
              live email sending switch above is on.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="auto-days-before">Days before the workshop</Label>
              <Input
                id="auto-days-before"
                type="number"
                min={1}
                max={365}
                value={daysBefore}
                onChange={e => setDaysBefore(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auto-template">Email template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="auto-template">
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {(templates || []).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => saveLogistics(auto.logistics.enabled)}
            disabled={updateLogistics.isPending}
          >
            Save logistics settings
          </Button>
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
              Once this is on, the app will email schools by itself — the first logistics
              request goes out {logisticsBody(true).daysBefore} days before each workshop,
              using the "{(templates || []).find(t => t.id === logisticsBody(true).templateId)?.name ?? "first"}"
              template. Type CONFIRM below to turn it on.
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
                saveLogistics(true, "Automatic logistics emails are on")
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
