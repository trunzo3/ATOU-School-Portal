import { useState, useEffect } from "react"
import { useLocation, useParams } from "wouter"
import { useIdentifyPortalUser, useFetchPortalAnswers, useSaveAnswer, useSaveTeachers, useGetPortalPages } from "@workspace/api-client-react"
import { PortalLayout } from "@/components/layout/portal-layout"
import { SchoolForm } from "@/components/shared/school-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { AtouLogo } from "@/components/shared/atou-logo"
import { PortalHelpfulInformation } from "@/components/shared/portal-helpful-information"
import { AlertCircle } from "lucide-react"

export function PortalEntry() {
  const { code } = useParams<{ code: string }>()
  const [, setLocation] = useLocation()
  
  const identify = useIdentifyPortalUser()
  const fetchAnswers = useFetchPortalAnswers()
  const { data: pages } = useGetPortalPages(code || "")

  const [email, setEmail] = useState("")
  const [identified, setIdentified] = useState(false)
  const [answers, setAnswers] = useState<any>(null)
  const [error, setError] = useState("")

  // Check if session exists in sessionStorage for this code
  useEffect(() => {
    const savedSession = sessionStorage.getItem(`atou_portal_${code}`)
    if (savedSession) {
      const parsed = JSON.parse(savedSession)
      setEmail(parsed.email)
      loadForm(parsed.email)
    }
  }, [code])

  const loadForm = (userEmail: string) => {
    fetchAnswers.mutate({ code: code!, data: { email: userEmail } }, {
      onSuccess: (data) => {
        setAnswers(data)
        setIdentified(true)
      },
      onError: () => {
        sessionStorage.removeItem(`atou_portal_${code}`)
        setIdentified(false)
        setError("Your session expired. Please enter your email again.")
      }
    })
  }

  const handleIdentify = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    
    identify.mutate({ code: code!, data: { email } }, {
      onSuccess: (session) => {
        sessionStorage.setItem(`atou_portal_${code}`, JSON.stringify(session))
        loadForm(email)
      },
      onError: (err: any) => {
        setError("We couldn't find that email on the authorized contact list for this school. Please try another or contact ATOU.")
      }
    })
  }

  const saveAnswer = useSaveAnswer()
  const saveTeachers = useSaveTeachers()

  const handleSaveAnswer = async (questionKey: string, value: string, amendId?: number) => {
    const saved = await saveAnswer.mutateAsync({ 
      code: code!, 
      questionKey, 
      data: { email, value, ...(amendId != null ? { amendId } : {}) } 
    })
    // Form is optimistic/local, so we just reload in background to keep history fresh
    loadForm(email)
    return saved
  }

  const handleSaveTeachers = async (rows: any[]) => {
    await saveTeachers.mutateAsync({ 
      code: code!, 
      data: { email, rows } 
    })
    loadForm(email)
  }

  if (!identified) {
    return (
      <PortalLayout>
        <Card className="mt-6 sm:mt-12 max-w-md mx-auto border-t-8 border-t-primary shadow-lg border-x-border border-b-border rounded-2xl">
          <CardHeader className="text-center pb-2">
            <AtouLogo className="mx-auto mb-4 h-28 w-auto max-w-[70%] sm:h-32 drop-shadow-sm" />
            <CardTitle className="text-2xl">Welcome</CardTitle>
            <CardDescription className="text-base mt-2">Please verify your email address to access your school's workshop form.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleIdentify} className="space-y-5">
              {error && (
                <div role="alert" className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl flex gap-2 items-start text-sm font-medium">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="sr-only">Email Address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  autoComplete="email"
                  placeholder="name@school.edu" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                  className="h-12 text-base px-4 bg-muted/20"
                />
              </div>
              <Button type="submit" size="lg" className="w-full text-base font-bold shadow-md hover:shadow-lg transition-all" disabled={identify.isPending || fetchAnswers.isPending}>
                {identify.isPending || fetchAnswers.isPending ? "Verifying..." : "Access Form"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout schoolName={answers?.school.name}>
      
      <PortalHelpfulInformation code={code!} pages={pages} />

      {answers && (
        <SchoolForm 
          code={code!}
          email={email}
          initialAnswers={answers}
          onSaveAnswer={handleSaveAnswer}
          onSaveTeachers={handleSaveTeachers}
          isReadOnly={answers.school.locked}
          onDone={() => setLocation(`/s/${code}/done`)}
        />
      )}
    </PortalLayout>
  )
}