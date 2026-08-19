import { useState, useEffect } from "react"
import { useLocation, useParams, Link } from "wouter"
import { useIdentifyPortalUser, useFetchPortalAnswers, useSaveAnswer, useSaveTeachers, useGetPortalPages } from "@workspace/api-client-react"
import { PortalLayout } from "@/components/layout/portal-layout"
import { SchoolForm } from "@/components/shared/school-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { AlertCircle, FileText } from "lucide-react"

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

  const handleSaveAnswer = async (questionKey: string, value: string) => {
    await saveAnswer.mutateAsync({ 
      code: code!, 
      questionKey, 
      data: { email, value } 
    })
    // Form is optimistic/local, so we just reload in background to keep history fresh
    loadForm(email)
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
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20" aria-hidden="true">
              <FileText className="h-6 w-6" />
            </div>
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
      
      {pages && pages.length > 0 && (
        <section aria-labelledby="helpful-information-title" className="mb-8 p-6 bg-white border border-border rounded-xl shadow-sm no-print">
          <h3 id="helpful-information-title" className="font-serif text-lg font-bold mb-4 flex items-center gap-3 text-foreground">
            <span className="h-10 w-10 rounded-full bg-secondary/10 text-secondary flex items-center justify-center border border-secondary/20" aria-hidden="true"><FileText className="h-5 w-5" /></span>
            Helpful Information
          </h3>
          <div className="flex flex-wrap gap-3">
            {pages.map(page => (
              <Link key={page.id} href={`/s/${code}/pages/${page.slug}`}>
                <Button variant="outline" className="rounded-full bg-white hover:bg-secondary/5 hover:text-secondary hover:border-secondary/30 transition-colors shadow-sm">
                  {page.title}
                </Button>
              </Link>
            ))}
          </div>
        </section>
      )}

      {answers && (
        <SchoolForm 
          code={code!}
          email={email}
          initialAnswers={answers}
          onSaveAnswer={handleSaveAnswer}
          onSaveTeachers={handleSaveTeachers}
          isReadOnly={answers.school.locked}
        />
      )}
    </PortalLayout>
  )
}