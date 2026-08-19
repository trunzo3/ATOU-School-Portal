import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"
import { Database, AlertCircle } from "lucide-react"

export function AdminSettings() {
  const { data: settings } = useGetSettings()
  const updateSettings = useUpdateSettings()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [apiKey, setApiKey] = useState("")
  const [baseId, setBaseId] = useState("")
  const [tableId, setTableId] = useState("")

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