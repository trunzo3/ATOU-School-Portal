import { Link, useLocation, useParams } from "wouter"
import { useGetAdminSchool, useSaveAnswer, useSaveTeachers, useSetSchoolLock, getGetAdminSchoolQueryKey, useFetchPortalAnswers } from "@workspace/api-client-react"
import { useEffect, useState } from "react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { SchoolForm } from "@/components/shared/school-form"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Printer, ChevronLeft, Lock, Unlock, Mail } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"

export function AdminSchoolDetail() {
  const { id } = useParams<{ id: string }>()
  const schoolId = parseInt(id || "0", 10)
  
  const { data: detail, isLoading } = useGetAdminSchool(schoolId, { 
    query: { enabled: !!schoolId, queryKey: getGetAdminSchoolQueryKey(schoolId) } 
  })
  
  const saveAnswer = useSaveAnswer()
  const saveTeachers = useSaveTeachers()
  const setLock = useSetSchoolLock()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  if (isLoading || !detail) return <AdminLayout><div className="p-8 text-muted-foreground animate-pulse">Loading school...</div></AdminLayout>

  // The email we attribute Admin edits to
  const adminEmail = "programcoordinator@touchofunderstanding.org"

  const handleSaveAnswer = async (questionKey: string, value: string) => {
    await saveAnswer.mutateAsync({ 
      code: detail.code, 
      questionKey, 
      data: { email: adminEmail, value } 
    })
    queryClient.invalidateQueries({ queryKey: getGetAdminSchoolQueryKey(schoolId) })
  }

  const handleSaveTeachers = async (rows: any[]) => {
    await saveTeachers.mutateAsync({ 
      code: detail.code, 
      data: { email: adminEmail, rows } 
    })
    queryClient.invalidateQueries({ queryKey: getGetAdminSchoolQueryKey(schoolId) })
  }

  const handleToggleLock = () => {
    setLock.mutate({ id: schoolId, data: { locked: !detail.locked } }, {
      onSuccess: () => {
        toast({ title: detail.locked ? "School unlocked" : "School locked" })
        queryClient.invalidateQueries({ queryKey: getGetAdminSchoolQueryKey(schoolId) })
      }
    })
  }

  // Need to adapt SchoolDetail to SchoolAnswers shape for the shared form
  // SchoolDetail returns contacts instead of the answers right now from the API...
  // WAIT - looking at the API spec, getAdminSchool returns `SchoolDetail` which does NOT contain answers.
  // Pam needs to edit the form. How?
  // Ah, the shared form uses `fetchPortalAnswers`. Pam can just use `fetchPortalAnswers`!
  // BUT the API requires a PortalIdentity. Can we call fetchPortalAnswers as Pam?
  // Let's create a local wrapper that fetches the answers using the school's code.
  
  return (
    <AdminSchoolFormWrapper 
      schoolId={schoolId} 
      detail={detail} 
      adminEmail={adminEmail}
      handleSaveAnswer={handleSaveAnswer}
      handleSaveTeachers={handleSaveTeachers}
      handleToggleLock={handleToggleLock}
    />
  )
}

function AdminSchoolFormWrapper({ schoolId, detail, adminEmail, handleSaveAnswer, handleSaveTeachers, handleToggleLock }: any) {
  // Use the portal fetch answers endpoint, tricking it with the admin email to act as identity
  // The API just checks if the email is authorized OR if there is an admin session cookie.
  // Admin session cookie wins.
  const fetchAnswers = useFetchPortalAnswers()
  const [answers, setAnswers] = useState<any>(null)
  const [, navigate] = useLocation()

  const refreshAnswers = () => {
    fetchAnswers.mutate({ code: detail.code, data: { email: adminEmail } }, {
      onSuccess: (data) => setAnswers(data)
    })
  }

  useEffect(() => {
    refreshAnswers()
  }, [detail.code])

  // After every save, re-fetch so the history trail updates immediately
  const onSaveAnswer = async (key: string, value: string) => {
    await handleSaveAnswer(key, value)
    refreshAnswers()
  }
  const onSaveTeachers = async (rows: any[]) => {
    await handleSaveTeachers(rows)
    refreshAnswers()
  }

  if (!answers) return <AdminLayout><div className="p-8 text-muted-foreground animate-pulse">Loading form data...</div></AdminLayout>

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 no-print border-b pb-6">
        <div className="min-w-0">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back to Dashboard
            </Button>
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary mb-1">School Workshop</p>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            {detail.name}
            {detail.locked && <Lock className="h-5 w-5 text-muted-foreground" />}
          </h1>
          <div className="text-sm text-muted-foreground mt-2 break-words">
            <strong>Authorized Contacts:</strong> {detail.contacts.map((c:any) => c.email).join(", ")}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center space-x-2 bg-muted/50 p-2 rounded-full border">
            {detail.locked ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Unlock className="h-4 w-4 text-primary" />}
            <Switch id="lock-toggle" checked={detail.locked} onCheckedChange={handleToggleLock} />
            <Label htmlFor="lock-toggle" className="cursor-pointer font-medium pr-1">Lock Form</Label>
          </div>
          
          {!detail.locked && (
            <Button variant="outline" className="border-secondary/35 text-secondary hover:bg-secondary hover:text-secondary-foreground" onClick={() => {
              sessionStorage.setItem("atou_send_selection", JSON.stringify([schoolId]))
              navigate("/admin/send")
            }}>
              <Mail className="h-4 w-4 mr-2" /> Send email
            </Button>
          )}

          <Button variant="outline" className="border-primary/35 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print Form
          </Button>
        </div>
      </div>

      {/* Re-use the exact same form the school sees */}
      <SchoolForm 
        code={detail.code}
        email={adminEmail}
        initialAnswers={answers}
        onSaveAnswer={onSaveAnswer}
        onSaveTeachers={onSaveTeachers}
        isReadOnly={detail.locked}
      />
    </AdminLayout>
  )
}