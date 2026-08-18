import { useEffect, useState } from "react"
import { useParams, Link, useLocation } from "wouter"
import { useFetchPortalAnswers } from "@workspace/api-client-react"
import { PortalLayout } from "@/components/layout/portal-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { CheckCircle2, ChevronLeft } from "lucide-react"

export function PortalDone() {
  const { code } = useParams<{ code: string }>()
  const [, setLocation] = useLocation()
  
  const fetchAnswers = useFetchPortalAnswers()
  const [answers, setAnswers] = useState<any>(null)
  
  useEffect(() => {
    const savedSession = sessionStorage.getItem(`atou_portal_${code}`)
    if (!savedSession) {
      setLocation(`/s/${code}`)
      return
    }
    const { email } = JSON.parse(savedSession)
    
    fetchAnswers.mutate({ code: code!, data: { email } }, {
      onSuccess: (data) => setAnswers(data)
    })
  }, [code])

  if (!answers) return <PortalLayout><div className="text-center py-20 animate-pulse">Loading...</div></PortalLayout>

  const getQ = (key: string) => answers.questions.find((q:any) => q.questionKey === key)
  
  const questions = [
    { label: "Teachers List", answered: !!answers.teachers.current },
    { label: "Workshop Time", answered: !!getQ("workshop_time")?.current },
    { label: "Activity Area", answered: !!getQ("activity_area")?.current },
    { label: "Speaker Area", answered: !!getQ("speaker_area")?.current },
  ]

  const missingCount = questions.filter(q => !q.answered).length

  return (
    <PortalLayout schoolName={answers.school.name}>
      <div className="max-w-2xl mx-auto space-y-8 py-8">
        
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#325566]/10 text-[#325566] mb-4">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-3xl font-serif font-semibold text-[#325566]">Form Saved</h2>
          <p className="text-lg text-muted-foreground">Thank you! Your information has been securely saved.</p>
        </div>

        <Card className="border-[#e2e4e0] shadow-md bg-white">
          <CardContent className="p-6 sm:p-8">
            <h3 className="font-semibold text-lg mb-4 border-b pb-2">Status Summary</h3>
            <ul className="space-y-3">
              {questions.map((q, i) => (
                <li key={i} className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">{q.label}</span>
                  <StatusBadge complete={q.answered} text={q.answered ? "Provided" : "Missing"} />
                </li>
              ))}
            </ul>

            {missingCount > 0 && (
              <div className="mt-6 bg-[#faf8f5] border border-[#e2e4e0] p-4 rounded-md">
                <p className="font-medium text-[#1c232e]">You have {missingCount} missing item{missingCount > 1 ? 's' : ''}.</p>
                <p className="text-sm text-muted-foreground mt-1">Please log back in before the workshop date to provide this information.</p>
              </div>
            )}
            
            <div className="mt-8 text-center border-t pt-6">
              <Link href={`/s/${code}`}>
                <Button variant="outline" className="gap-2">
                  <ChevronLeft className="h-4 w-4" /> Go back and adjust
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

      </div>
    </PortalLayout>
  )
}