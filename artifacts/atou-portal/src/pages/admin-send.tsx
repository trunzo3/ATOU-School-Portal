import { useGetDueSchools, useGetEmailTemplate, useUpdateEmailTemplate } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/input"
import { formatPacificTime } from "@/lib/utils"
import { Copy, Mail, AlertCircle, Save } from "lucide-react"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"

export function AdminSend() {
  const { data: dueSchools } = useGetDueSchools()
  const { data: template } = useGetEmailTemplate()
  const updateTemplate = useUpdateEmailTemplate()
  const { toast } = useToast()

  const [body, setBody] = useState("")

  useEffect(() => {
    if (template) {
      setBody(template.body)
    }
  }, [template])

  const handleSaveTemplate = () => {
    updateTemplate.mutate({ data: { body } }, {
      onSuccess: () => {
        toast({ title: "Template saved successfully" })
      }
    })
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: "Copied to clipboard" })
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-foreground">Send Form Links</h1>
          <p className="text-muted-foreground mt-1">Copy and paste these details into your email client.</p>
        </div>

        <div className="bg-blue-50 border-blue-200 border text-blue-800 p-4 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold mb-1">No email service is connected yet.</p>
            <p>For now, please copy the email addresses, subjects, and links below and paste them into your own email client to send to the schools.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h2 className="text-lg font-serif font-semibold">Schools Due (Next 30 Days)</h2>
            {dueSchools?.length === 0 ? (
              <p className="text-muted-foreground bg-muted/30 p-8 rounded-lg text-center border">No schools are currently due for forms.</p>
            ) : (
              <div className="space-y-4">
                {dueSchools?.map(school => (
                  <Card key={school.schoolId}>
                    <CardContent className="p-4 space-y-4">
                      <div>
                        <h3 className="font-semibold">{school.name}</h3>
                        <p className="text-sm text-muted-foreground">Workshop: {formatPacificTime(school.workshopDate).split(',')[0]}</p>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center gap-2 p-2 bg-muted/50 rounded border">
                          <div className="truncate flex-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">To:</span>
                            {school.contactEmails.join(", ")}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => copyText(school.contactEmails.join(", "))}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        <div className="flex justify-between items-center gap-2 p-2 bg-muted/50 rounded border">
                          <div className="truncate flex-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Subject:</span>
                            {school.subject}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => copyText(school.subject)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex justify-between items-center gap-2 p-2 bg-primary/5 border border-primary/20 text-primary rounded">
                          <div className="truncate flex-1 font-medium">
                            <span className="text-primary/70 text-xs uppercase tracking-wider block mb-1">Unique Link:</span>
                            {school.link}
                          </div>
                          <Button variant="outline" size="sm" className="bg-white" onClick={() => copyText(school.link)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>Email Template</CardTitle>
                <CardDescription>
                  This template is for your own reference. Make sure you keep the {"{{link}}"} placeholder where you want the school's link to appear.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea 
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[300px] font-sans"
                  placeholder="Hello, please fill out your workshop form at {{link}}"
                />
              </CardContent>
              <CardFooter>
                <Button onClick={handleSaveTemplate} disabled={updateTemplate.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Template
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>

      </div>
    </AdminLayout>
  )
}