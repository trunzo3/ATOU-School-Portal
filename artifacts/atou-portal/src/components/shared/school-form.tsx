import { useState, useEffect, useRef } from "react"
import { SchoolAnswers, AnswerInput, TeachersInput } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input, Textarea } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { TimePicker } from "@/components/ui/time-picker"
import { AtouLogo } from "@/components/shared/atou-logo"
import { formatPacificTime, cn } from "@/lib/utils"
import { buildSchedule as buildScheduleLib, computeBreakTimes, effectiveStudentCount, needsThreeSessions as needsThreeSessionsFor } from "@workspace/schedule"
import { AlertCircle, CalendarDays, Plus, Trash2, Info, Users, Save, CheckCircle2, ChevronRight, Printer } from "lucide-react"

interface SchoolFormProps {
  code: string;
  email: string;
  initialAnswers: SchoolAnswers;
  // Returns the saved history entry so an in-progress edit can keep
  // amending it (amendId) instead of appending a new entry per keystroke.
  onSaveAnswer: (key: string, value: string, amendId?: number) => Promise<{ id: number } | void>;
  onSaveTeachers: (rows: any[]) => Promise<void>;
  isReadOnly?: boolean;
  // The admin school-detail page has its own Print Form action, so it hides this one.
  showPrintButton?: boolean;
  // Supplied only by the school portal. The admin version intentionally omits it.
  onDone?: () => void;
}

type SaveState = "dirty" | "saving" | "saved";

// "one" through "ten" spelled out for the missing-count note; numerals beyond
const missingCountWord = (n: number) =>
  ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n - 1] ?? String(n)

function QuestionTitle({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-sans font-bold text-primary-foreground"
      >
        {number}
      </span>
      <span>
        <span className="sr-only">Question {number}: </span>
        {children}
      </span>
    </CardTitle>
  )
}

export function SchoolForm({ code, email, initialAnswers, onSaveAnswer, onSaveTeachers, isReadOnly, showPrintButton = true, onDone }: SchoolFormProps) {
  // Extract state per question
  const getQ = (key: string) => initialAnswers.questions.find(q => q.questionKey === key)
  
  // The Start Time picker only accepts "HH:MM"; answers imported from the
  // Airtable sheet are free text (e.g. "8:15am - 9:45am") and are shown
  // separately as the current saved answer.
  const rawTimeValue = getQ("workshop_time")?.current?.value || ""
  const isClockTime = /^\d{1,2}:\d{2}$/.test(rawTimeValue.trim())
  const [timeValue, setTimeValue] = useState(isClockTime ? rawTimeValue.trim() : "")
  const [timingNote, setTimingNote] = useState(getQ("timing_note")?.current?.value || "")
  const cleanTime = (v: string | undefined) => {
    const t = (v || "").trim()
    return /^\d{1,2}:\d{2}$/.test(t) ? t : ""
  }
  const [lunchStart, setLunchStart] = useState(cleanTime(getQ("lunch_start")?.current?.value))
  const [lunchEnd, setLunchEnd] = useState(cleanTime(getQ("lunch_end")?.current?.value))
  const [activityArea, setActivityArea] = useState(getQ("activity_area")?.current?.value || "")
  const [speakerArea, setSpeakerArea] = useState(getQ("speaker_area")?.current?.value || "")
  const [notes, setNotes] = useState(getQ("notes")?.current?.value || "")

  // Teachers state
  const initialTeachers = initialAnswers.teachers.current?.rows || [{ firstName: "", lastName: "", email: "", studentCount: 0 }]
  const [teacherRows, setTeacherRows] = useState(initialTeachers)
  const [teachersSaved, setTeachersSaved] = useState(true) // Track dirty state
  const [savingTeacher, setSavingTeacher] = useState(false)
  const [teacherSaveError, setTeacherSaveError] = useState("")

  // Per-question save state so each section can show a Save button / "Saved" label
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  // Clicking Done requests navigation, but navigation waits until autosaves
  // already triggered by editing/blur have settled. Done itself never saves.
  const [finishRequested, setFinishRequested] = useState(false)
  const [answerSaveError, setAnswerSaveError] = useState("")
  // Values saved during this session (the prop may lag behind a refetch)
  const lastSavedRef = useRef<Record<string, string>>({})
  // Latest draft value per key, so a completing save can tell if it's still current
  const draftRef = useRef<Record<string, string>>({})
  // Value currently being saved per key (dedupes blur-save + Save-button click)
  const inFlightRef = useRef<Record<string, string | undefined>>({})
  // Monotonic save counter per key so an older save can't clobber a newer one
  const saveSeqRef = useRef<Record<string, number>>({})
  // In-progress edit session per question (time pickers): the id of the
  // history entry being amended in place. One edit session = one entry.
  const amendIdRef = useRef<Record<string, number | undefined>>({})
  // Bumped when a session ends, so a save resolving late can't revive it
  const sessionTokenRef = useRef<Record<string, number>>({})
  // Serializes session saves per key so the first save's id (the entry to
  // amend) is known before the next part-change saves
  const sessionChainRef = useRef<Record<string, Promise<void>>>({})

  const markEdited = (key: string, value: string, savedValue: string | undefined) => {
    setAnswerSaveError("")
    draftRef.current[key] = value
    const baseline = lastSavedRef.current[key] ?? savedValue ?? ""
    setSaveStates(s => {
      if (value === baseline) {
        if (s[key] !== "dirty") return s
        const next = { ...s }
        delete next[key]
        return next
      }
      if (s[key] === "dirty") return s
      return { ...s, [key]: "dirty" }
    })
  }

  // Local helper to handle confirmation for existing answers
  const handleSave = async (key: string, value: string, currentValue: string | undefined) => {
    const baseline = lastSavedRef.current[key] ?? currentValue
    if (value === baseline) return; // No change
    if (!value.trim()) return; // Server rejects empty values; nothing to save
    if (inFlightRef.current[key] === value) return; // Same save already running (blur + click)
    // No overwrite confirmation: autosave made it constant, and every change is kept in history.
    const seq = (saveSeqRef.current[key] = (saveSeqRef.current[key] ?? 0) + 1)
    inFlightRef.current[key] = value
    setSaveStates(s => ({ ...s, [key]: "saving" }))
    try {
      await onSaveAnswer(key, value);
      if (saveSeqRef.current[key] === seq) {
        lastSavedRef.current[key] = value
        const latest = draftRef.current[key] ?? value
        // Only report "saved" if the field hasn't been edited again meanwhile
        setSaveStates(s => ({ ...s, [key]: latest === value ? "saved" : "dirty" }))
      }
    } catch {
      if (saveSeqRef.current[key] === seq) {
        setSaveStates(s => ({ ...s, [key]: "dirty" }))
      }
      setAnswerSaveError("We couldn't save one of your changes. Please use the Save button in that section to try again.")
      setFinishRequested(false)
    } finally {
      if (inFlightRef.current[key] === value) inFlightRef.current[key] = undefined
    }
  }

  // Saves a mid-edit value immediately (so nothing is lost if the tab is
  // closed) while amending the SAME history entry for the whole edit
  // session. Saves are chained per key so the first save's id is known
  // before the next one fires.
  const handleSessionSave = (key: string, value: string, currentValue: string | undefined) => {
    const token = sessionTokenRef.current[key] ?? 0
    const prev = sessionChainRef.current[key] ?? Promise.resolve()
    sessionChainRef.current[key] = prev.then(async () => {
      const baseline = lastSavedRef.current[key] ?? currentValue
      if (value === baseline) return
      if (!value.trim()) return // Server rejects empty values
      // A newer part-change is queued behind us; let it do the saving
      if ((draftRef.current[key] ?? value) !== value) return
      if (inFlightRef.current[key] === value) return
      const seq = (saveSeqRef.current[key] = (saveSeqRef.current[key] ?? 0) + 1)
      inFlightRef.current[key] = value
      setSaveStates(s => ({ ...s, [key]: "saving" }))
      try {
        const saved = await onSaveAnswer(key, value, amendIdRef.current[key])
        // Keep amending this entry only while the same session is open
        if (saved && (sessionTokenRef.current[key] ?? 0) === token) {
          amendIdRef.current[key] = saved.id
        }
        if (saveSeqRef.current[key] === seq) {
          lastSavedRef.current[key] = value
          const latest = draftRef.current[key] ?? value
          setSaveStates(s => ({ ...s, [key]: latest === value ? "saved" : "dirty" }))
        }
      } catch {
        if (saveSeqRef.current[key] === seq) {
          setSaveStates(s => ({ ...s, [key]: "dirty" }))
        }
        setAnswerSaveError("We couldn't save one of your changes. Please use the Save button in that section to try again.")
        setFinishRequested(false)
      } finally {
        if (inFlightRef.current[key] === value) inFlightRef.current[key] = undefined
      }
    })
  }

  // Called when focus truly leaves a time picker: the edit session is over,
  // so the next change starts a fresh history entry. The safety-net save
  // runs INSIDE the session (amending the same entry, deduped if already
  // saved), and the session only closes after every queued save settles —
  // otherwise a save still in flight would append instead of amend.
  const endEditSession = (key: string, value: string, currentValue: string | undefined) => {
    handleSessionSave(key, value, currentValue)
    const prev = sessionChainRef.current[key] ?? Promise.resolve()
    sessionChainRef.current[key] = prev.then(() => {
      sessionTokenRef.current[key] = (sessionTokenRef.current[key] ?? 0) + 1
      amendIdRef.current[key] = undefined
    })
  }

  // One Save button / "Saved" label per section, driven by that section's question keys
  const renderSectionSave = (keys: string[], onSave: () => void) => {
    if (isReadOnly || initialAnswers.school.locked) return null
    const states = keys.map(k => saveStates[k]).filter(Boolean)
    if (states.length === 0) return null
    const state: SaveState = states.includes("saving") ? "saving" : states.includes("dirty") ? "dirty" : "saved"
    return (
      <div className="flex justify-end no-print">
        {state === "saved" ? (
          <span className="flex items-center gap-2 text-sm font-medium text-primary">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        ) : (
          <Button size="sm" onClick={onSave} disabled={state === "saving"}>
            <Save className="h-4 w-4 mr-2" /> {state === "saving" ? "Saving..." : "Save"}
          </Button>
        )}
      </div>
    )
  }

  // The live schedule shown under the time fields — shared with the Done
  // page and the API server via @workspace/schedule so the conflict verdict
  // is the same everywhere.
  const buildSchedule = (threeSessions: boolean) =>
    buildScheduleLib({ workshopTime: timeValue, lunchStart, lunchEnd, threeSessions })

  // Bumped on every teacher edit; a save only marks the list "saved" if no
  // edit happened while its request was in flight (otherwise the newer edit
  // would be silently treated as saved and could be lost).
  const teacherRevRef = useRef(0)
  // Prevents overlapping teacher saves (manual click + pending autosave)
  const teacherSaveInFlightRef = useRef(false)

  const handleTeacherChange = (index: number, field: string, value: any) => {
    setTeacherSaveError("")
    teacherRevRef.current++
    const newRows = [...teacherRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setTeacherRows(newRows);
    setTeachersSaved(false);
  }

  const addTeacher = () => {
    setTeacherSaveError("")
    teacherRevRef.current++
    setTeacherRows([...teacherRows, { firstName: "", lastName: "", email: "", studentCount: 0 }]);
    setTeachersSaved(false);
  }

  const removeTeacher = (index: number) => {
    setTeacherSaveError("")
    teacherRevRef.current++
    const newRows = teacherRows.filter((_, i) => i !== index);
    setTeacherRows(newRows.length ? newRows : [{ firstName: "", lastName: "", email: "", studentCount: 0 }]);
    setTeachersSaved(false);
  }

  // First name, last name, and email are required for every teacher; the
  // student count is NOT — a row saves without it and the count can be
  // added later (its field shows a red outline until then).
  const rowIsBlank = (r: any) =>
    !String(r.firstName || "").trim() && !String(r.lastName || "").trim() &&
    !String(r.email || "").trim() && !(Number(r.studentCount) > 0)
  const rowIdentityComplete = (r: any) =>
    Boolean(String(r.firstName || "").trim() && String(r.lastName || "").trim() && String(r.email || "").trim())
  // Partially typed: something is filled in, but not all three required fields
  const rowIsPartial = (r: any) => !rowIsBlank(r) && !rowIdentityComplete(r)
  const rowMissingCount = (r: any) => rowIdentityComplete(r) && !(Number(r.studentCount) > 0)

  const nonBlankTeacherRows = teacherRows.filter(r => !rowIsBlank(r))
  const hasPartialTeacherRows = teacherRows.some(rowIsPartial)
  const canSaveTeacherList = !hasPartialTeacherRows && nonBlankTeacherRows.length > 0
  const missingCountTotal = teacherRows.filter(rowMissingCount).length

  const saveTeacherList = async () => {
    if (!canSaveTeacherList || teacherSaveInFlightRef.current) return;
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    const rev = teacherRevRef.current;
    teacherSaveInFlightRef.current = true;
    setSavingTeacher(true);
    setTeacherSaveError("");
    try {
      await onSaveTeachers(nonBlankTeacherRows);
      // Only acknowledge if nothing changed while the request was in
      // flight; otherwise stay dirty so the newer edit gets saved too.
      if (teacherRevRef.current === rev) setTeachersSaved(true);
    } catch {
      setTeacherSaveError("We couldn't save the teacher list. Check your connection, then use Save List to try again.");
      setFinishRequested(false);
    } finally {
      teacherSaveInFlightRef.current = false;
      setSavingTeacher(false);
    }
  }

  // Debounced auto-save for teachers (optional, but requested for background save)
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    // Not while a save is in flight: when it finishes, savingTeacher flips
    // and this effect re-runs, scheduling a save of the latest draft if the
    // in-flight save couldn't acknowledge it (edited mid-request).
    if (!teachersSaved && !isReadOnly && !savingTeacher) {
      if (canSaveTeacherList) {
        if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
        autoSaveTimeout.current = setTimeout(() => {
          saveTeacherList();
        }, 2000);
      }
    }
    return () => { if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current) };
  }, [teacherRows, teachersSaved, savingTeacher]);

  const teacherDraftCanAutosave = canSaveTeacherList

  useEffect(() => {
    if (!finishRequested || !onDone) return

    const answerSavePending = Object.entries(saveStates).some(([key, state]) =>
      state === "saving" ||
      (state === "dirty" && Boolean((draftRef.current[key] || "").trim()))
    )
    const teacherSavePending =
      savingTeacher || (!teachersSaved && teacherDraftCanAutosave)

    if (!answerSavePending && !teacherSavePending) {
      onDone()
    }
  }, [
    finishRequested,
    onDone,
    saveStates,
    savingTeacher,
    teachersSaved,
    teacherDraftCanAutosave,
  ])


  const totalStudents = teacherRows.reduce((sum, r) => sum + (Number(r.studentCount) || 0), 0);

  // Student count that drives the two- vs three-session schedule: the live
  // teacher list total when there is one, otherwise ATOU's approximate count.
  const effectiveStudents = effectiveStudentCount(totalStudents, initialAnswers.school.approxStudents);
  const needsThreeSessions = needsThreeSessionsFor(effectiveStudents);

  // Collapsed/expanded state per question's history. Expanding sticks until
  // the user collapses it or leaves the page — saves/refetches don't reset it.
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const toggleHistory = (key: string) =>
    setExpandedHistory(prev => ({ ...prev, [key]: !prev[key] }));

  const historyToggleRow = (key: string, count: number) => (
    <button
      type="button"
      onClick={() => toggleHistory(key)}
      className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      aria-expanded={!!expandedHistory[key]}
    >
      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expandedHistory[key] ? "rotate-90" : ""}`} />
      History ({count} {count === 1 ? "change" : "changes"})
    </button>
  )

  const renderHistory = (key: string, history: any[]) => {
    if (!history || history.length === 0) return null;
    return (
      <div className="mt-3 text-sm text-muted-foreground no-print">
        {historyToggleRow(key, history.length)}
        {expandedHistory[key] && (
          <div className="mt-2 bg-muted/20 p-3 rounded-md border border-dashed space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex justify-between items-start gap-4">
                <span className="min-w-0 italic whitespace-pre-wrap break-words">"{h.value}"</span>
                <span className="text-xs whitespace-nowrap shrink-0">{h.enteredBy} • {formatPacificTime(h.enteredAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Format a stored workshop start time for display: "14:00" -> "2:00 PM".
  // Imported free-text values are shown as-is.
  const formatStartTime = (value: string) => {
    const trimmed = (value || "").trim();
    if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed;
    const [h, m] = trimmed.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  // Workshop time history: one entry per previous start time, with the
  // attribution above and the schedule + timing note that went with it.
  const renderWorkshopTimeHistory = (
    timeQ: { current: any; history: any[] } | undefined,
    noteQ: { current: any; history: any[] } | undefined
  ) => {
    const timeHistory = timeQ?.history || [];
    if (timeHistory.length === 0) return null;
    // All note versions, newest first, so we can find the note that was in
    // effect while a given start time was current.
    const noteVersions = [
      ...(noteQ?.current ? [noteQ.current] : []),
      ...(noteQ?.history || []),
    ].sort((a, b) => new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime());
    const entries = timeHistory.map((h: any, i: number) => {
      // The moment this start time was replaced by a newer one:
      const supersededAt = i === 0 ? timeQ?.current?.enteredAt : timeHistory[i - 1].enteredAt;
      const boundary = supersededAt ? new Date(supersededAt).getTime() : Infinity;
      const note = noteVersions.find(n => new Date(n.enteredAt).getTime() <= boundary);
      const trimmed = (h.value || "").trim();
      const schedule = /^\d{1,2}:\d{2}$/.test(trimmed) ? computeBreakTimes(trimmed) : null;
      return { ...h, schedule, note: note?.value || null };
    });
    return (
      <div className="mt-3 text-sm text-muted-foreground no-print">
        {historyToggleRow("workshop_time", entries.length)}
        {expandedHistory["workshop_time"] && (
          <div className="mt-2 bg-muted/20 p-3 rounded-md border border-dashed space-y-3">
            {entries.map((h: any, i: number) => (
              <div key={i} className="space-y-0.5">
                <div className="text-xs">{h.enteredBy} • {formatPacificTime(h.enteredAt)}</div>
                <div className="italic whitespace-pre-wrap break-words">"{formatStartTime(h.value)}"</div>
                {h.schedule && <div className="text-xs">Calculated schedule: {h.schedule}</div>}
                {h.note && (
                  <div className="text-xs">
                    Timing note: <span className="italic whitespace-pre-wrap break-words">"{h.note}"</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderTeacherHistory = (history: any[]) => {
    if (!history || history.length === 0) return null;
    const sorted = [...history].sort(
      (a, b) => new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime()
    );
    return (
      <div className="mt-4 text-sm text-muted-foreground no-print">
        {historyToggleRow("teachers", sorted.length)}
        {expandedHistory["teachers"] && (
        <div className="mt-2 space-y-3">
          {sorted.map((h, i) => (
            <div key={i} className="bg-muted/20 p-3 rounded-md border border-dashed">
              <div className="text-xs mb-2 font-medium text-foreground/80">
                Changed by {h.enteredBy} · {formatPacificTime(h.enteredAt)} · {h.rows.length} teacher{h.rows.length === 1 ? "" : "s"}, {h.totalStudents} student{h.totalStudents === 1 ? "" : "s"}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground/70">
                    <th className="font-medium pb-1 pr-3">First name</th>
                    <th className="font-medium pb-1 pr-3">Last name</th>
                    <th className="font-medium pb-1 pr-3">Email</th>
                    <th className="font-medium pb-1 text-right">Students</th>
                  </tr>
                </thead>
                <tbody>
                  {h.rows.map((r: any, ri: number) => (
                    <tr key={ri}>
                      <td className="py-0.5 pr-3">{r.firstName}</td>
                      <td className="py-0.5 pr-3">{r.lastName}</td>
                      <td className="py-0.5 pr-3 break-all">{r.email}</td>
                      <td className="py-0.5 text-right">{r.studentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        )}
      </div>
    )
  }

  const qTime = getQ("workshop_time");
  const qNote = getQ("timing_note");
  const qAct = getQ("activity_area");
  const qSpk = getQ("speaker_area");
  const qNotes = getQ("notes");
  const calculatedSchedule = timeValue ? buildSchedule(needsThreeSessions) : null;
  const workshopDate = initialAnswers.school.workshopDate
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${initialAnswers.school.workshopDate}T12:00:00`))
    : "Date TBD";
  const workshopStart = timeValue
    ? formatStartTime(timeValue)
    : formatStartTime(qTime?.current?.value || "") || "Not provided";
  const printableTeachers = teacherRows.filter(
    row => row.firstName.trim() || row.lastName.trim() || row.email.trim() || Number(row.studentCount) > 0
  );

  return (
    <>
    <div className="space-y-8 w-full max-w-3xl mx-auto pb-12 no-print">
      
      {/* Header Info */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 sm:p-8 print:border-none print:p-0 print:bg-transparent flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground tracking-tight">{initialAnswers.school.name}</h2>
          <span
            className={
              initialAnswers.school.workshopDate
                ? "inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold whitespace-nowrap shadow-sm print:bg-transparent print:text-foreground print:border print:border-foreground/30 print:shadow-none"
                : "inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground border border-border px-3 py-1.5 text-sm font-medium whitespace-nowrap print:bg-transparent print:shadow-none"
            }
          >
            <CalendarDays className="h-4 w-4" />
            {workshopDate}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
          {initialAnswers.school.locked && (
            <StatusBadge complete={true} text="Form Locked" />
          )}
          {showPrintButton && (
            <Button
              variant="outline"
              className="no-print bg-white shadow-sm"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4 mr-2" /> Print form
            </Button>
          )}
        </div>
      </div>

      <div className="text-sm bg-accent/50 text-accent-foreground p-5 rounded-xl border border-accent flex gap-3 no-print items-start">
        <span aria-hidden="true" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-sm">
          <Info className="h-4 w-4" />
        </span>
        <p className="leading-relaxed">Answers save automatically as you enter them. Answers can be changed any time before the workshop. <br/><span className="inline-block mt-1">You are logged in as <strong className="font-semibold">{email}</strong>.</span></p>
      </div>

      {/* Teachers Section */}
      <Card className="border-l-4 border-l-primary print:shadow-none print:border-b-2 print:border-l-0 print:border-black print:rounded-none">
        <CardHeader className="print:px-0">
          <div className="flex justify-between items-start">
            <div>
              <QuestionTitle number={1}>
                Teachers' names for each grade level and student count for each teacher
              </QuestionTitle>
              <CardDescription className="text-base mt-2">
                (this will allow us to pack the take-home materials separately for each teacher)
              </CardDescription>
            </div>
            {!initialAnswers.teachers.current && <StatusBadge complete={false} text="Missing" />}
          </div>
        </CardHeader>
        <CardContent className="print:px-0">
          <div className="space-y-4">
            <div className="hidden md:grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground no-print">
              <div className="col-span-3">First Name</div>
              <div className="col-span-3">Last Name</div>
              <div className="col-span-4">Email</div>
              <div className="col-span-2">Students</div>
            </div>
            
            {teacherRows.map((row, i) => (
              <div key={i} className="space-y-1.5 print:space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start md:items-center p-4 md:p-0 border border-border rounded-xl md:border-none md:bg-transparent bg-muted/25 shadow-sm md:shadow-none print:border-b print:rounded-none print:py-2">
                  <div className="md:hidden text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Teacher {i+1}</div>
                  <div className="col-span-3">
                     <Input placeholder="First Name" value={row.firstName} onChange={(e) => handleTeacherChange(i, "firstName", e.target.value)} disabled={isReadOnly || initialAnswers.school.locked} className="print:border-none print:p-0 print:h-auto" />
                  </div>
                  <div className="col-span-3">
                     <Input placeholder="Last Name" value={row.lastName} onChange={(e) => handleTeacherChange(i, "lastName", e.target.value)} disabled={isReadOnly || initialAnswers.school.locked} className="print:border-none print:p-0 print:h-auto" />
                  </div>
                  <div className="col-span-4">
                     <Input type="email" placeholder="Email Address" value={row.email} onChange={(e) => handleTeacherChange(i, "email", e.target.value)} disabled={isReadOnly || initialAnswers.school.locked} className="print:border-none print:p-0 print:h-auto" />
                  </div>
                  <div className="col-span-2 flex gap-2 items-center">
                     <Input type="number" min="0" step="1" inputMode="numeric" placeholder="Count" value={row.studentCount || ""} onChange={(e) => handleTeacherChange(i, "studentCount", parseInt(e.target.value)||0)} disabled={isReadOnly || initialAnswers.school.locked} className={cn(
                       "[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none print:border-none print:p-0 print:h-auto",
                       // Saved row missing its count: red outline, no message —
                       // come back and fill in the number (doesn't block anything)
                       rowMissingCount(row) && "border-destructive bg-destructive/10 focus-visible:ring-destructive/30 print:bg-transparent",
                     )} />
                    {!isReadOnly && !initialAnswers.school.locked && (
                      <Button variant="ghost" size="icon" className="text-destructive h-10 w-10 flex-shrink-0 no-print rounded-full hover:bg-destructive/10" onClick={() => removeTeacher(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {rowIsPartial(row) && (
                  <p className="text-sm text-foreground no-print">First name, last name, and email address are required.</p>
                )}
              </div>
            ))}
            
            {/* Print extra blank lines */}
            <div className="hidden print:block space-y-6 mt-6">
               <div className="border-b border-gray-300 w-full"></div>
               <div className="border-b border-gray-300 w-full"></div>
               <div className="border-b border-gray-300 w-full"></div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t gap-4">
              <div className={cn("flex items-center gap-2 font-medium", missingCountTotal > 0 && "text-destructive")}>
                <Users className={cn("h-5 w-5", missingCountTotal > 0 ? "text-destructive" : "text-muted-foreground")} />
                <span>
                  Total Students: <span className="text-lg">{totalStudents}</span>
                  {missingCountTotal > 0 && (
                    <>, {missingCountWord(missingCountTotal)} teacher count{missingCountTotal === 1 ? "" : "s"} missing</>
                  )}
                </span>
              </div>
              
              {!isReadOnly && !initialAnswers.school.locked && (
                <div className="flex gap-2 w-full sm:w-auto no-print">
                  <Button variant="outline" onClick={addTeacher} className="w-full sm:w-auto">
                    <Plus className="h-4 w-4 mr-2" /> Add Teacher
                  </Button>
                  {!teachersSaved && (
                    <Button onClick={saveTeacherList} disabled={savingTeacher || !canSaveTeacherList} className="w-full sm:w-auto">
                      <Save className="h-4 w-4 mr-2" /> {savingTeacher ? "Saving..." : "Save List"}
                    </Button>
                  )}
                  {teachersSaved && initialAnswers.teachers.current && (
                    <Button variant="ghost" disabled className="w-full sm:w-auto text-primary">
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Saved
                    </Button>
                  )}
                </div>
              )}
            </div>

            {teacherSaveError && (
              <div role="alert" className="no-print flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{teacherSaveError}</span>
              </div>
            )}

            {initialAnswers.teachers.current && (
              <div className="text-xs text-muted-foreground text-right no-print">
                Last updated by {initialAnswers.teachers.current.enteredBy} at {formatPacificTime(initialAnswers.teachers.current.enteredAt)}
              </div>
            )}

            {renderTeacherHistory(initialAnswers.teachers.history)}
          </div>
        </CardContent>
      </Card>

      {/* Workshop Time */}
      <Card className="border-l-4 border-l-primary print:shadow-none print:border-b-2 print:border-l-0 print:border-black print:rounded-none">
        <CardHeader className="print:px-0">
          <div className="flex justify-between items-start">
            <div>
              <QuestionTitle number={2}>Workshop time</QuestionTitle>
              <CardDescription className="text-base mt-2">
                {needsThreeSessions
                  ? `(With ${effectiveStudents} students, the workshop runs three 1.5 hour sessions: two before lunch with a 15 minute break between them, and one after lunch. Please provide a start time and your school's lunch time.)`
                  : "(Please provide a 3hr 15 minute time frame. This will allow for a break in between the workshop sections)"}
              </CardDescription>
            </div>
            {!qTime?.current && <StatusBadge complete={false} text="Missing" />}
          </div>
        </CardHeader>
        <CardContent className="print:px-0">
          <div className="space-y-4 max-w-sm">
            {qTime?.current && !isClockTime && (
              <div className="space-y-1">
                <Label className="text-muted-foreground">Currently saved</Label>
                <div className="bg-primary/5 p-3 rounded-md text-sm border border-primary/20 whitespace-pre-line">
                  {qTime.current.value}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Start Time</Label>
              <TimePicker
                aria-label="Start Time"
                value={timeValue}
                onChange={v => { setTimeValue(v); markEdited("workshop_time", v, isClockTime ? rawTimeValue.trim() : ""); handleSessionSave("workshop_time", v, qTime?.current?.value) }}
                onSessionEnd={v => endEditSession("workshop_time", v, qTime?.current?.value)}
                disabled={isReadOnly || initialAnswers.school.locked}
              />
            </div>
            
            {needsThreeSessions && (
              <div className="space-y-4 print:grid print:grid-cols-2 print:gap-3 print:space-y-0">
                <div className="space-y-2">
                  <Label>School Lunch Starts</Label>
                  <TimePicker
                    aria-label="School Lunch Starts"
                    value={lunchStart}
                    onChange={v => { setLunchStart(v); markEdited("lunch_start", v, cleanTime(getQ("lunch_start")?.current?.value)); handleSessionSave("lunch_start", v, cleanTime(getQ("lunch_start")?.current?.value)) }}
                    onSessionEnd={v => endEditSession("lunch_start", v, cleanTime(getQ("lunch_start")?.current?.value))}
                    disabled={isReadOnly || initialAnswers.school.locked}
                  />
                </div>
                <div className="space-y-2">
                  <Label>School Lunch Ends</Label>
                  <TimePicker
                    aria-label="School Lunch Ends"
                    value={lunchEnd}
                    onChange={v => { setLunchEnd(v); markEdited("lunch_end", v, cleanTime(getQ("lunch_end")?.current?.value)); handleSessionSave("lunch_end", v, cleanTime(getQ("lunch_end")?.current?.value)) }}
                    onSessionEnd={v => endEditSession("lunch_end", v, cleanTime(getQ("lunch_end")?.current?.value))}
                    disabled={isReadOnly || initialAnswers.school.locked}
                  />
                </div>
              </div>
            )}

            {(() => {
              const schedule = timeValue ? buildSchedule(needsThreeSessions) : null;
              if (!schedule) return null;
              return (
                <div className="bg-primary/5 text-primary p-3 rounded-md text-sm border border-primary/20 space-y-1">
                  <div className="font-semibold">Calculated Schedule</div>
                  {schedule.lines.map((l, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span className={l.label === "Lunch" ? "font-semibold text-amber-700 dark:text-amber-300" : l.label === "Break" ? "text-primary/70" : "font-medium"}>{l.label}</span>
                      <span>{l.time}</span>
                    </div>
                  ))}
                  {schedule.pending && (
                    <div className="text-primary/80 pt-1">{schedule.pending}</div>
                  )}
                  {schedule.warnings.map((w, i) => (
                    <div key={i} className="text-destructive pt-1">{w}</div>
                  ))}
                </div>
              );
            })()}

            <div className="space-y-2 pt-4">
              <Label className="text-muted-foreground flex justify-between">
                <span>Timing Notes / Constraints</span>
                <span className="text-xs font-normal">Optional</span>
              </Label>
              <Textarea 
                placeholder="e.g. Recess is at 10:15 so we must break then..."
                value={timingNote}
                onChange={e => { setTimingNote(e.target.value); markEdited("timing_note", e.target.value, qNote?.current?.value) }}
                onBlur={() => handleSave("timing_note", timingNote, qNote?.current?.value)}
                disabled={isReadOnly || initialAnswers.school.locked}
                className="min-h-[80px] print:border-none print:p-0"
              />
            </div>
            
            {renderSectionSave(
              needsThreeSessions
                ? ["workshop_time", "timing_note", "lunch_start", "lunch_end"]
                : ["workshop_time", "timing_note"],
              () => {
                handleSave("workshop_time", timeValue, qTime?.current?.value)
                handleSave("timing_note", timingNote, qNote?.current?.value)
                if (needsThreeSessions) {
                  handleSave("lunch_start", lunchStart, cleanTime(getQ("lunch_start")?.current?.value))
                  handleSave("lunch_end", lunchEnd, cleanTime(getQ("lunch_end")?.current?.value))
                }
              })}

            {qTime?.current && (
              <div className="text-xs text-muted-foreground no-print">
                Last updated by {qTime.current.enteredBy} at {formatPacificTime(qTime.current.enteredAt)}
              </div>
            )}
          </div>
          {renderWorkshopTimeHistory(qTime, qNote)}
          {(["lunch_start", "lunch_end"] as const).map(key => {
            const hist = (getQ(key)?.history || []).map((h: any) => ({ ...h, value: formatStartTime(h.value) }));
            if (hist.length === 0) return null;
            return (
              <div key={key} className="mt-1">
                <div className="text-xs text-muted-foreground mt-3">{key === "lunch_start" ? "Lunch start" : "Lunch end"}</div>
                {renderHistory(key, hist)}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Activity Area */}
      <Card className="border-l-4 border-l-primary print:shadow-none print:border-b-2 print:border-l-0 print:border-black print:rounded-none">
        <CardHeader className="print:px-0">
          <div className="flex justify-between items-start">
            <div>
              <QuestionTitle number={3}>Area for activity stations</QuestionTitle>
              <CardDescription className="text-base mt-2">
                (2 classrooms near each other or MP room or Library)
              </CardDescription>
            </div>
            {!qAct?.current && <StatusBadge complete={false} text="Missing" />}
          </div>
        </CardHeader>
        <CardContent className="print:px-0">
          <div className="space-y-2">
            <Input 
              value={activityArea} 
              onChange={e => { setActivityArea(e.target.value); markEdited("activity_area", e.target.value, qAct?.current?.value) }} 
              onBlur={() => handleSave("activity_area", activityArea, qAct?.current?.value)}
              disabled={isReadOnly || initialAnswers.school.locked}
              placeholder="Where will activity stations be held?"
              className="print:border-none print:p-0 print:border-b print:rounded-none print:border-gray-300"
            />
            {renderSectionSave(["activity_area"], () => handleSave("activity_area", activityArea, qAct?.current?.value))}
            {qAct?.current && (
              <div className="text-xs text-muted-foreground mt-2 no-print">
                Last updated by {qAct.current.enteredBy} at {formatPacificTime(qAct.current.enteredAt)}
              </div>
            )}
            {renderHistory("activity_area", qAct?.history || [])}
          </div>
        </CardContent>
      </Card>

      {/* Speaker Area */}
      <Card className="border-l-4 border-l-primary print:shadow-none print:border-b-2 print:border-l-0 print:border-black print:rounded-none">
        <CardHeader className="print:px-0">
          <div className="flex justify-between items-start">
            <div>
              <QuestionTitle number={4}>An additional separate area for speakers</QuestionTitle>
              <CardDescription className="text-base mt-2">
                (if in a classroom, please provide #)
              </CardDescription>
            </div>
            {!qSpk?.current && <StatusBadge complete={false} text="Missing" />}
          </div>
        </CardHeader>
        <CardContent className="print:px-0">
          <div className="space-y-2">
            <Input 
              value={speakerArea} 
              onChange={e => { setSpeakerArea(e.target.value); markEdited("speaker_area", e.target.value, qSpk?.current?.value) }} 
              onBlur={() => handleSave("speaker_area", speakerArea, qSpk?.current?.value)}
              disabled={isReadOnly || initialAnswers.school.locked}
              placeholder="Where will speakers present?"
              className="print:border-none print:p-0 print:border-b print:rounded-none print:border-gray-300"
            />
            {renderSectionSave(["speaker_area"], () => handleSave("speaker_area", speakerArea, qSpk?.current?.value))}
            {qSpk?.current && (
              <div className="text-xs text-muted-foreground mt-2 no-print">
                Last updated by {qSpk.current.enteredBy} at {formatPacificTime(qSpk.current.enteredAt)}
              </div>
            )}
            {renderHistory("speaker_area", qSpk?.history || [])}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="border-l-4 border-l-secondary print:shadow-none print:border-b-2 print:border-l-0 print:border-black print:rounded-none">
        <CardHeader className="print:px-0">
          <div>
            <QuestionTitle number={5}>Anything else we should know?</QuestionTitle>
            <CardDescription className="text-base mt-2">
              Optional notes for the ATOU team.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="print:px-0">
          <div className="space-y-2">
            <Textarea 
              value={notes} 
              onChange={e => { setNotes(e.target.value); markEdited("notes", e.target.value, qNotes?.current?.value) }} 
              onBlur={() => handleSave("notes", notes, qNotes?.current?.value)}
              disabled={isReadOnly || initialAnswers.school.locked}
              placeholder="Any additional information..."
              className="min-h-[100px] print:border-none print:p-0 print:border-b print:rounded-none print:border-gray-300"
            />
            {renderSectionSave(["notes"], () => handleSave("notes", notes, qNotes?.current?.value))}
            {qNotes?.current && (
              <div className="text-xs text-muted-foreground mt-2 no-print">
                Last updated by {qNotes.current.enteredBy} at {formatPacificTime(qNotes.current.enteredAt)}
              </div>
            )}
            {renderHistory("notes", qNotes?.history || [])}
          </div>
        </CardContent>
      </Card>

    </div>

    {onDone && (
      <div className="mt-8 no-print rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div>
          <h2 className="font-serif text-xl font-bold text-foreground">Finished making changes?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your information saves as you enter it. Review what ATOU has received when you are done.
          </p>
          {answerSaveError && (
            <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-semibold text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              {answerSaveError}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          onClick={() => setFinishRequested(true)}
          disabled={finishRequested}
          className="sm:flex-shrink-0 gap-2 font-bold"
        >
          {finishRequested ? (
            "Finishing..."
          ) : (
            <>
              Done — Review Information
              <ChevronRight className="h-5 w-5" />
            </>
          )}
        </Button>
      </div>
    )}

    <article className="atou-print-document hidden print:block" aria-label="A Touch of Understanding workshop logistics form">
      <header className="atou-print-masthead">
        <AtouLogo className="atou-print-logo" />
        <div>
          <p className="atou-print-eyebrow">A Touch of Understanding</p>
          <h1>Workshop Logistics Form</h1>
          <p className="atou-print-subtitle">School workshop planning details</p>
        </div>
      </header>

      <div className="atou-print-metadata">
        <div>
          <span>School</span>
          <strong>{initialAnswers.school.name}</strong>
        </div>
        <div>
          <span>Workshop date</span>
          <strong>{workshopDate}</strong>
        </div>
      </div>

      <dl className="atou-print-summary">
        <div>
          <dt>Total students</dt>
          <dd>{totalStudents || "—"}</dd>
        </div>
        <div>
          <dt>Workshop start</dt>
          <dd>{workshopStart}</dd>
        </div>
        <div>
          <dt>Teachers participating</dt>
          <dd>{printableTeachers.length || "—"}</dd>
        </div>
      </dl>

      <section className="atou-print-section">
        <div className="atou-print-section-heading">
          <span aria-hidden="true">1</span>
          <div>
            <h2>Teachers &amp; Student Counts</h2>
            <p>Listed by teacher so take-home materials can be packed separately.</p>
          </div>
        </div>
        <table className="atou-print-teacher-table">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Email</th>
              <th>Students</th>
            </tr>
          </thead>
          <tbody>
            {printableTeachers.length ? printableTeachers.map((row, index) => (
              <tr key={index}>
                <td>{[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}</td>
                <td>{row.email || "—"}</td>
                <td>{Number(row.studentCount) || "—"}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={3} className="atou-print-empty">No teacher information provided.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total students</td>
              <td>{totalStudents || "—"}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="atou-print-section">
        <div className="atou-print-section-heading">
          <span aria-hidden="true">2</span>
          <div>
            <h2>Workshop Time</h2>
            <p>
              {needsThreeSessions
                ? "Three 1.5-hour sessions, including the school lunch period."
                : "Three hours 15 minutes total, including a scheduled break."}
            </p>
          </div>
        </div>
        <div className="atou-print-detail-grid">
          <div>
            <span>Start time</span>
            <strong>{workshopStart}</strong>
          </div>
          <div>
            <span>Timing notes / constraints</span>
            <strong>{timingNote.trim() || "None provided"}</strong>
          </div>
          {needsThreeSessions && (
            <>
              <div>
                <span>School lunch starts</span>
                <strong>{lunchStart ? formatStartTime(lunchStart) : "Not provided"}</strong>
              </div>
              <div>
                <span>School lunch ends</span>
                <strong>{lunchEnd ? formatStartTime(lunchEnd) : "Not provided"}</strong>
              </div>
            </>
          )}
        </div>
        <div className="atou-print-schedule">
          <span>Calculated schedule</span>
          {calculatedSchedule ? (
            <>
              <div>
                {calculatedSchedule.lines.map((line, index) => (
                  <span key={line.label}>
                    <strong>{line.label}</strong> {line.time}
                    {index < calculatedSchedule.lines.length - 1 && <b aria-hidden="true">•</b>}
                  </span>
                ))}
              </div>
              {calculatedSchedule.pending && <p>{calculatedSchedule.pending}</p>}
              {calculatedSchedule.warnings.map(warning => <p key={warning}>{warning}</p>)}
            </>
          ) : (
            <strong>Available after a valid start time is provided.</strong>
          )}
        </div>
      </section>

      <section className="atou-print-section">
        <div className="atou-print-section-heading">
          <span aria-hidden="true">3</span>
          <div>
            <h2>Area for Activity Stations</h2>
            <p>Two nearby classrooms, a multipurpose room, or the library.</p>
          </div>
        </div>
        <div className="atou-print-answer">
          <span>Activity stations</span>
          <strong>{activityArea.trim() || "Not provided"}</strong>
        </div>
      </section>

      <section className="atou-print-section">
        <div className="atou-print-section-heading">
          <span aria-hidden="true">4</span>
          <div>
            <h2>Additional Separate Area for Speakers</h2>
            <p>If using a classroom, include the room number.</p>
          </div>
        </div>
        <div className="atou-print-answer">
          <span>Speaker area</span>
          <strong>{speakerArea.trim() || "Not provided"}</strong>
        </div>
      </section>

      <section className="atou-print-section">
        <div className="atou-print-section-heading">
          <span aria-hidden="true">5</span>
          <div>
            <h2>Anything Else We Should Know?</h2>
            <p>Additional notes for the ATOU team.</p>
          </div>
        </div>
        <div className="atou-print-answer atou-print-notes">
          <strong>{notes.trim() || "No additional notes provided."}</strong>
        </div>
      </section>

      <footer className="atou-print-footer">
        <span>A Touch of Understanding · Workshop Logistics</span>
        <span>{initialAnswers.school.name} · {workshopDate}</span>
      </footer>
    </article>
    </>
  )
}
