import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  useGetEmailStatus,
  useUpdateEmailSettings,
  useSendTestEmail,
  getGetEmailStatusQueryKey,
} from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"
import { Database, AlertCircle, Mail, Send, CheckCircle2, XCircle } from "lucide-react"

function apiErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: unknown }).data
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
    ) {
      return (data as { error: string }).error
    }
  }
  return error instanceof Error ? error.message : "The test email could not be sent."
}

export function AdminSettings() {
  const { data: settings } = useGetSettings()
  const { data: emailStatus } = useGetEmailStatus()
  const updateSettings = useUpdateSettings()
  const updateEmailSettings = useUpdateEmailSettings()
  const sendTestEmail = useSendTestEmail()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [apiKey, setApiKey] = useState("")
  const [baseId, setBaseId] = useState("")
  const [tableId, setTableId] = useState("")
  const [testEmail, setTestEmail] = useState("")
  const [testResponse, setTestResponse] = useState<{
    kind: "success" | "error"
    text: string
  } | null>(null)

  useEffect(() => {
    if (settings) {
      setBaseId(settings.baseId || "")
      setTableId(settings.tableId || "")
      // We never receive the API key back, so we leave it empty.
      // If settings.apiKeySet is true, the user knows it's set.
    }
  }, [settings])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateSettings.mutate({ data: { apiKey, baseId, tableId } }, {
      onSuccess: () => {
        toast({ title: "Airtable connection saved" })
        setApiKey("") // Clear it after save
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
      }
    })
  }

  const handleEmailToggle = (enabled: boolean) => {
    setTestResponse(null)
    updateEmailSettings.mutate(
      { data: { enabled } },
      {
        onSuccess: (status) => {
          queryClient.invalidateQueries({ queryKey: getGetEmailStatusQueryKey() })
          toast({
            title: status.enabled
              ? "Live email sending is on"
              : "Live email sending is off",
          })
        },
        onError: (error) => {
          setTestResponse({ kind: "error", text: apiErrorMessage(error) })
        },
      },
    )
  }

  const handleTestEmail = (e: React.FormEvent) => {
    e.preventDefault()
    setTestResponse(null)
    sendTestEmail.mutate(
      { data: { email: testEmail.trim() } },
      {
        onSuccess: (result) => {
          setTestResponse({
            kind: "success",
            text: result.providerId
              ? `${result.message} Resend ID: ${result.providerId}`
              : result.message,
          })
        },
        onError: (error) => {
          setTestResponse({ kind: "error", text: apiErrorMessage(error) })
        },
      },
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary mb-1">Configuration</p>
          <h1 className="text-3xl font-serif font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure integrations and app behavior.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Email Delivery
                </CardTitle>
                <CardDescription>
                  Send workshop logistics emails through Resend.
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <Switch
                    aria-label="Live email sending"
                    checked={emailStatus?.enabled ?? false}
                    onCheckedChange={handleEmailToggle}
                    disabled={
                      !emailStatus?.configured || updateEmailSettings.isPending
                    }
                  />
                  <span className="text-sm font-medium">
                    {emailStatus?.enabled ? "On" : "Off"}
                  </span>
                </div>
                <span
                  className={`text-xs ${
                    emailStatus?.configured
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {emailStatus?.configured
                    ? "Resend connected"
                    : "Resend not connected"}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p>
                Live school emails are sent from{" "}
                <strong className="text-foreground">
                  {emailStatus?.from ??
                    "A Touch of Understanding <workshops@send.touchofunderstanding.org>"}
                </strong>
                .
              </p>
              <p className="mt-2">
                The switch above controls live school email delivery. A test
                email can still be sent while live delivery is off.
              </p>
            </div>

            <form onSubmit={handleTestEmail} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="testEmail">Send a test email to</Label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    id="testEmail"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.org"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    required
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={
                      !emailStatus?.configured ||
                      sendTestEmail.isPending ||
                      !testEmail.trim()
                    }
                    className="sm:flex-shrink-0"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {sendTestEmail.isPending ? "Sending…" : "Send Test"}
                  </Button>
                </div>
              </div>

              {testResponse && (
                <div
                  role={testResponse.kind === "error" ? "alert" : "status"}
                  className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                    testResponse.kind === "success"
                      ? "border-primary/25 bg-primary/5 text-foreground"
                      : "border-destructive/25 bg-destructive/5 text-destructive"
                  }`}
                >
                  {testResponse.kind === "success" ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  )}
                  <span>{testResponse.text}</span>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  Airtable Connection
                </CardTitle>
                <CardDescription>Sync form answers directly to your Airtable base.</CardDescription>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <Switch disabled checked={false} />
                  <span className="text-sm font-medium text-muted-foreground">Off</span>
                </div>
                <span className="text-xs text-muted-foreground mt-1">Coming soon</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 p-4 rounded-xl mb-6 border border-dashed flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                This integration is currently disabled in the prototype phase. You can save your credentials below, but no data will be synced to Airtable yet.
              </p>
            </div>

            <form id="airtable-form" onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">Airtable Personal Access Token</Label>
                <Input 
                  id="apiKey" 
                  type="password" 
                  placeholder={settings?.apiKeySet ? "•••••••••••••••• (Leave blank to keep existing)" : "pat..."}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="baseId">Base ID</Label>
                  <Input 
                    id="baseId" 
                    placeholder="app..." 
                    value={baseId}
                    onChange={e => setBaseId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tableId">Table ID</Label>
                  <Input 
                    id="tableId" 
                    placeholder="tbl..." 
                    value={tableId}
                    onChange={e => setTableId(e.target.value)}
                  />
                </div>
              </div>
            </form>
          </CardContent>
          <CardFooter className="border-t bg-muted/10 justify-end pt-6">
            <Button type="submit" form="airtable-form" disabled={updateSettings.isPending}>
              Save Settings
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AdminLayout>
  )
}