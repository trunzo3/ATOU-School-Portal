import { useEffect, useState } from "react"
import { useParams, Link, useLocation } from "wouter"
import {
  SchoolAnswers,
  TeacherRow,
  useFetchPortalAnswers,
  useGetPortalPages,
} from "@workspace/api-client-react"
import { buildSchedule, describeConflict, effectiveStudentCount, needsThreeSessions } from "@workspace/schedule"
import { PortalLayout } from "@/components/layout/portal-layout"
import { PortalHelpfulInformation } from "@/components/shared/portal-helpful-information"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn, missingCountWord } from "@/lib/utils"
import { AlertCircle, CheckCircle2, ChevronLeft } from "lucide-react"

function formatTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return value

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return value

  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 || 12
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

function formatWorkshopDate(value: string | null) {
  if (!value) return "Date not yet scheduled"
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function MissingValue({ optional = false }: { optional?: boolean }) {
  if (optional) {
    return <span className="text-muted-foreground italic">Not provided (optional)</span>
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-900 border border-amber-200">
      <AlertCircle className="h-4 w-4" />
      Missing
    </span>
  )
}

function SummaryField({
  label,
  value,
  optional = false,
}: {
  label: string
  value: string
  optional?: boolean
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-2 whitespace-pre-wrap break-words text-foreground">
        {value ? value : <MissingValue optional={optional} />}
      </dd>
    </div>
  )
}

function teacherIsComplete(row: TeacherRow) {
  return Boolean(row.firstName.trim() && row.lastName.trim() && row.email.trim() && row.studentCount > 0)
}

export function PortalDone() {
  const { code } = useParams<{ code: string }>()
  const [, setLocation] = useLocation()

  const fetchAnswers = useFetchPortalAnswers()
  const { data: pages } = useGetPortalPages(code || "")
  const [answers, setAnswers] = useState<SchoolAnswers | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    const savedSession = sessionStorage.getItem(`atou_portal_${code}`)
    if (!savedSession) {
      setLocation(`/s/${code}`)
      return
    }

    try {
      const { email } = JSON.parse(savedSession)
      fetchAnswers.mutate(
        { code: code!, data: { email } },
        {
          onSuccess: data => setAnswers(data),
          onError: () => setLoadFailed(true),
        },
      )
    } catch {
      sessionStorage.removeItem(`atou_portal_${code}`)
      setLocation(`/s/${code}`)
    }
  }, [code])

  if (loadFailed) {
    return (
      <PortalLayout tinted>
        <div className="max-w-xl mx-auto py-16 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h2 className="font-serif text-2xl font-bold">We couldn&apos;t load your information</h2>
          <p className="text-muted-foreground mt-2">Please return to the form and try again.</p>
          <Button asChild className="mt-6">
            <Link href={`/s/${code}`}>Back to the form</Link>
          </Button>
        </div>
      </PortalLayout>
    )
  }

  if (!answers) {
    return (
      <PortalLayout tinted>
        <div className="text-center py-20 text-muted-foreground animate-pulse">Loading your information...</div>
      </PortalLayout>
    )
  }

  const getValue = (key: string) =>
    answers.questions.find(question => question.questionKey === key)?.current?.value.trim() || ""

  const teachers = answers.teachers.current?.rows || []
  const teachersComplete = teachers.length > 0 && teachers.every(teacherIsComplete)
  const totalStudents = teachers.reduce((sum, teacher) => sum + (Number(teacher.studentCount) || 0), 0)
  // Same treatment the entry form gives its total line: red with a note
  // naming how many counts are missing; the number stays the sum entered.
  const missingTeacherCounts = teachers.filter(teacher => !(Number(teacher.studentCount) > 0)).length
  const effectiveStudents = effectiveStudentCount(totalStudents, answers.school.approxStudents)
  const needsLunchTimes = needsThreeSessions(effectiveStudents)

  const workshopTime = getValue("workshop_time")
  const timingNote = getValue("timing_note")
  const lunchStart = getValue("lunch_start")
  const lunchEnd = getValue("lunch_end")
  const activityArea = getValue("activity_area")
  const speakerArea = getValue("speaker_area")
  const notes = getValue("notes")

  // Same schedule/conflict verdict the form shows (shared library): a
  // workshop time whose lunch conflicts with the calculated schedule is
  // flagged like a missing answer, not shown as "Provided".
  const schedule = workshopTime
    ? buildSchedule({ workshopTime, lunchStart, lunchEnd, threeSessions: needsLunchTimes })
    : null
  const timeConflicts = schedule?.conflicts ?? []
  const timeConflict = timeConflicts.length > 0
  const conflictSummary = timeConflicts.map(describeConflict).join(", and ")

  const requiredItems = [
    { label: "Teachers and student counts", complete: teachersComplete },
    {
      label: timeConflict ? `Workshop time (${conflictSummary})` : "Workshop time",
      complete: Boolean(workshopTime) && !timeConflict,
    },
    { label: "Activity station area", complete: Boolean(activityArea) },
    { label: "Speaker area", complete: Boolean(speakerArea) },
  ]
  const missingItems = requiredItems.filter(item => !item.complete)

  return (
    <PortalLayout schoolName={answers.school.name} tinted>
      <PortalHelpfulInformation code={code!} pages={pages} />

      <div className="max-w-3xl mx-auto space-y-6 pb-8">
        <div className="text-center space-y-3 py-3 sm:py-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-2 ring-8 ring-primary/5">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">Your Information Is Saved</h2>
          <p className="text-lg text-muted-foreground">
            Review what ATOU has received below. This page is read-only.
          </p>
          <p className="font-semibold text-foreground">{formatWorkshopDate(answers.school.workshopDate)}</p>
        </div>

        {missingItems.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 flex gap-3 items-start">
            <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold">All required information has been provided.</p>
              <p className="text-sm mt-1">You can return to the form any time if something changes.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 flex gap-3 items-start">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold">A few things are still needed</p>
              <p className="text-sm mt-1">You can come back to this page any time. Here&apos;s what&apos;s still open:</p>
              <ul className="text-sm mt-2 list-disc pl-5 space-y-1">
                {missingItems.map(item => <li key={item.label}>{item.label}</li>)}
              </ul>
              <p className="text-sm mt-2">
                <Link href={`/s/${code}`} className="font-semibold underline underline-offset-4 hover:text-amber-700">
                  Return to the form
                </Link>{" "}
                to add them.
              </p>
            </div>
          </div>
        )}

        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <CardHeader className="border-b bg-muted/20 flex-row items-center justify-between gap-4">
            <CardTitle className="text-xl">Teachers &amp; Student Counts</CardTitle>
            <StatusBadge complete={teachersComplete} text={teachersComplete ? "Provided" : "Missing"} />
          </CardHeader>
          <CardContent className="p-0">
            {teachers.length > 0 ? (
              <>
                <div className="divide-y">
                  {teachers.map((teacher, index) => (
                    <div key={index} className="p-5 grid gap-3 sm:grid-cols-[1.2fr_1.5fr_auto] sm:items-center">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Teacher {index + 1}</p>
                        <p className="font-semibold mt-1">
                          {[teacher.firstName, teacher.lastName].filter(Boolean).join(" ") || <MissingValue />}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</p>
                        <p className="mt-1 break-all">{teacher.email || <MissingValue />}</p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Students</p>
                        <p className="font-semibold mt-1">
                          {teacher.studentCount > 0 ? (
                            teacher.studentCount
                          ) : (
                            // Empty red-outlined box — mirrors the form's missing-count field
                            <span aria-label="Student count missing" className="inline-block h-9 w-16 rounded-md border border-destructive bg-destructive/10 align-middle" />
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={cn(
                  "border-t bg-primary/5 px-5 py-4 flex justify-between gap-4 font-bold",
                  missingTeacherCounts > 0 && "text-destructive",
                )}>
                  <span>Total students</span>
                  <span className="text-right">
                    {totalStudents}
                    {missingTeacherCounts > 0 && (
                      <>, {missingCountWord(missingTeacherCounts)} teacher count{missingTeacherCounts === 1 ? "" : "s"} missing</>
                    )}
                  </span>
                </div>
              </>
            ) : (
              <div className="p-6"><MissingValue /></div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="border-b bg-muted/20 flex-row items-center justify-between gap-4">
            <CardTitle className="text-xl">Workshop Time</CardTitle>
            <StatusBadge
              complete={Boolean(workshopTime) && !timeConflict}
              text={!workshopTime ? "Missing" : timeConflict ? "Schedule conflict" : "Provided"}
            />
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            {timeConflict && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900 flex gap-2 items-start">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  The workshop time you provided conflicts with the calculated schedule: {conflictSummary}.{" "}
                  <Link href={`/s/${code}`} className="font-semibold underline underline-offset-4 hover:text-amber-700">
                    Return to the form
                  </Link>{" "}
                  to adjust the times.
                </span>
              </div>
            )}
            <dl className="grid sm:grid-cols-2 gap-4">
              <SummaryField label="Workshop start" value={workshopTime ? formatTime(workshopTime) : ""} />
              {needsLunchTimes && (
                <>
                  <SummaryField label="School lunch starts" value={lunchStart ? formatTime(lunchStart) : ""} />
                  <SummaryField label="School lunch ends" value={lunchEnd ? formatTime(lunchEnd) : ""} />
                </>
              )}
              <SummaryField label="Timing notes / constraints" value={timingNote} optional />
            </dl>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="border-b bg-muted/20 flex-row items-center justify-between gap-4">
            <CardTitle className="text-xl">Workshop Spaces</CardTitle>
            <StatusBadge complete={Boolean(activityArea && speakerArea)} text={activityArea && speakerArea ? "Provided" : "Missing"} />
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <dl className="grid sm:grid-cols-2 gap-4">
              <SummaryField label="Activity station area" value={activityArea} />
              <SummaryField label="Separate speaker area" value={speakerArea} />
            </dl>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="border-b bg-muted/20 flex-row items-center justify-between gap-4">
            <CardTitle className="text-xl">Anything Else We Should Know?</CardTitle>
            <StatusBadge complete={Boolean(notes)} text={notes ? "Provided" : "Optional"} neutral />
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <dl>
              <SummaryField label="Additional notes" value={notes} optional />
            </dl>
          </CardContent>
        </Card>

        <div className="text-center pt-2">
          <Button asChild variant="outline" size="lg" className="gap-2 rounded-full font-bold px-6">
            <Link href={`/s/${code}`}>
              <ChevronLeft className="h-4 w-4" />
              Back to the form to make changes
            </Link>
          </Button>
        </div>
      </div>
    </PortalLayout>
  )
}