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

  const handleDone = () => {
    setLocation(`/s/${code}/done`)
  }

  if (!identified) {
    return (
      <PortalLayout>
        <Card className="mt-12 max-w-md mx-auto shadow-md border-[#e2e4e0]">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-serif text-[#325566]">Welcome</CardTitle>
            <CardDescription className="text-base">Please verify your email address to access your school's workshop form.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleIdentify} className="space-y-4 pt-4">
              {error && (
                <div className="bg-destructive/10 text-destructive p-3 rounded flex gap-2 items-start text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="sr-only">Email Address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@school.edu" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                  className="h-12 text-lg px-4 bg-[#fbfbf9]"
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base font-medium" disabled={identify.isPending || fetchAnswers.isPending}>
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
        <div className="mb-8 p-4 bg-white border rounded-lg shadow-sm no-print">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-[#325566]">
            <FileText className="h-4 w-4" /> Helpful Information
          </h3>
          <div className="flex flex-wrap gap-2">
            {pages.map(page => (
              <Link key={page.id} href={`/s/${code}/pages/${page.slug}`}>
                <Button variant="outline" size="sm" className="bg-[#fbfbf9]">
                  {page.title}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      )}

      {answers && (
        <SchoolForm 
          code={code!}
          email={email}
          initialAnswers={answers}
          onSaveAnswer={handleSaveAnswer}
          onSaveTeachers={handleSaveTeachers}
          onDone={handleDone}
          isReadOnly={answers.school.locked}
        />
      )}
    </PortalLayout>
  )
}