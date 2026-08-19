import { useState, useEffect, useRef } from "react"
import { SchoolAnswers, AnswerInput, TeachersInput } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input, Textarea } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { formatPacificTime } from "@/lib/utils"
import { Clock, Plus, Trash2, Info, Users, Save, CheckCircle2, ChevronRight } from "lucide-react"

interface SchoolFormProps {
  code: string;
  email: string;
  initialAnswers: SchoolAnswers;
  onSaveAnswer: (key: string, value: string) => Promise<void>;
  onSaveTeachers: (rows: any[]) => Promise<void>;
  isReadOnly?: boolean;
}

type SaveState = "dirty" | "saving" | "saved";

export function SchoolForm({ code, email, initialAnswers, onSaveAnswer, onSaveTeachers, isReadOnly }: SchoolFormProps) {
  // Extract state per question
  const getQ = (key: string) => initialAnswers.questions.find(q => q.questionKey === key)
  
  // The Start Time picker only accepts "HH:MM"; answers imported from the
  // Airtable sheet are free text (e.g. "8:15am - 9:45am") and are shown
  // separately as the current saved answer.
  const rawTimeValue = getQ("workshop_time")?.current?.value || ""
  const isClockTime = /^\d{1,2}:\d{2}$/.test(rawTimeValue.trim())
  const [timeValue, setTimeValue] = useState(isClockTime ? rawTimeValue.trim() : "")
  const [timingNote, setTimingNote] = useState(getQ("timing_note")?.current?.value || "")
  const [activityArea, setActivityArea] = useState(getQ("activity_area")?.current?.value || "")
  const [speakerArea, setSpeakerArea] = useState(getQ("speaker_area")?.current?.value || "")
  const [notes, setNotes] = useState(getQ("notes")?.current?.value || "")

  // Teachers state
  const initialTeachers = initialAnswers.teachers.current?.rows || [{ firstName: "", lastName: "", email: "", studentCount: 0 }]
  const [teacherRows, setTeacherRows] = useState(initialTeachers)
  const [teachersSaved, setTeachersSaved] = useState(true) // Track dirty state
  const [savingTeacher, setSavingTeacher] = useState(false)

  // Per-question save state so each section can show a Save button / "Saved" label
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  // Values saved during this session (the prop may lag behind a refetch)
  const lastSavedRef = useRef<Record<string, string>>({})
  // Latest draft value per key, so a completing save can tell if it's still current
  const draftRef = useRef<Record<string, string>>({})
  // Value currently being saved per key (dedupes blur-save + Save-button click)
  const inFlightRef = useRef<Record<string, string | undefined>>({})
  // Monotonic save counter per key so an older save can't clobber a newer one
  const saveSeqRef = useRef<Record<string, number>>({})

  const markEdited = (key: string, value: string, savedValue: string | undefined) => {
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
    } catch (err) {
      if (saveSeqRef.current[key] === seq) {
        setSaveStates(s => ({ ...s, [key]: "dirty" }))
      }
      throw err
    } finally {
      if (inFlightRef.current[key] === value) inFlightRef.current[key] = undefined
    }
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

  const computeBreakTimes = (startTimeStr: string) => {
    if (!startTimeStr) return null;
    const [h, m] = startTimeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    
    const start = new Date();
    start.setHours(h, m, 0);
    
    const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    const s1End = new Date(start.getTime() + 90 * 60000);
    const s2Start = new Date(s1End.getTime() + 15 * 60000);
    const s2End = new Date(s2Start.getTime() + 90 * 60000);
    
    return `${fmt(start)} – ${fmt(s1End)}, break, ${fmt(s2Start)} – ${fmt(s2End)}`;
  }

  const handleTeacherChange = (index: number, field: string, value: any) => {
    const newRows = [...teacherRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setTeacherRows(newRows);
    setTeachersSaved(false);
  }

  const addTeacher = () => {
    setTeacherRows([...teacherRows, { firstName: "", lastName: "", email: "", studentCount: 0 }]);
    setTeachersSaved(false);
  }

  const removeTeacher = (index: number) => {
    const newRows = teacherRows.filter((_, i) => i !== index);
    setTeacherRows(newRows.length ? newRows : [{ firstName: "", lastName: "", email: "", studentCount: 0 }]);
    setTeachersSaved(false);
  }

  const saveTeacherList = async () => {
    // Validate
    const valid = teacherRows.every(r => r.firstName && r.lastName && r.email && r.studentCount >= 0);
    if (!valid) {
      alert("Please fill out all teacher fields before saving.");
      return;
    }
    setSavingTeacher(true);
    await onSaveTeachers(teacherRows);
    setTeachersSaved(true);
    setSavingTeacher(false);
  }

  // Debounced auto-save for teachers (optional, but requested for background save)
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!teachersSaved && !isReadOnly) {
      const valid = teacherRows.every(r => r.firstName && r.lastName && r.email && r.studentCount > 0);
      if (valid) {
        if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
        autoSaveTimeout.current = setTimeout(() => {
          saveTeacherList();
        }, 2000);
      }
    }
    return () => { if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current) };
  }, [teacherRows, teachersSaved]);


  const totalStudents = teacherRows.reduce((sum, r) => sum + (Number(r.studentCount) || 0), 0);

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

  return (
    <div className="space-y-8 print:space-y-6 w-full max-w-3xl mx-auto pb-12">
      
      {/* Header Info */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 sm:p-8 print:border-none print:p-0 print:bg-transparent flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground tracking-tight">{initialAnswers.school.name}</h2>
          <p className="text-primary font-medium mt-2 flex items-center gap-2 text-sm sm:text-base">
            <Clock className="h-4 w-4" /> 
            {initialAnswers.school.workshopDate ? formatPacificTime(initialAnswers.school.workshopDate).split(',')[0] : "Date TBD"}
          </p>
        </div>
        {initialAnswers.school.locked && (
          <StatusBadge complete={true} text="Form Locked" />
        )}
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
              <CardTitle className="flex items-center gap-2">
                Teachers' names for each grade level and student count for each teacher
              </CardTitle>
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
              <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start md:items-center p-4 md:p-0 border border-border rounded-xl md:border-none md:bg-transparent bg-muted/25 shadow-sm md:shadow-none print:border-b print:rounded-none print:py-2">
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
                   <Input type="number" min="0" placeholder="Count" value={row.studentCount || ""} onChange={(e) => handleTeacherChange(i, "studentCount", parseInt(e.target.value)||0)} disabled={isReadOnly || initialAnswers.school.locked} className="print:border-none print:p-0 print:h-auto" />
                  {!isReadOnly && !initialAnswers.school.locked && (
                    <Button variant="ghost" size="icon" className="text-destructive h-10 w-10 flex-shrink-0 no-print rounded-full hover:bg-destructive/10" onClick={() => removeTeacher(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            
            {/* Print extra blank lines */}
            <div className="hidden print:block space-y-6 mt-6">
               <div className="border-b border-gray-300 w-full"></div>
               <div className="border-b border-gray-300 w-full"></div>
               <div className="border-b border-gray-300 w-full"></div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t gap-4">
              <div className="flex items-center gap-2 font-medium">
                <Users className="h-5 w-5 text-muted-foreground" />
                Total Students: <span className="text-lg">{totalStudents}</span>
              </div>
              
              {!isReadOnly && !initialAnswers.school.locked && (
                <div className="flex gap-2 w-full sm:w-auto no-print">
                  <Button variant="outline" onClick={addTeacher} className="w-full sm:w-auto">
                    <Plus className="h-4 w-4 mr-2" /> Add Teacher
                  </Button>
                  {!teachersSaved && (
                    <Button onClick={saveTeacherList} disabled={savingTeacher} className="w-full sm:w-auto">
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
              <CardTitle>Workshop time</CardTitle>
              <CardDescription className="text-base mt-2">
                (Please provide a 3hr 15 minute time frame. This will allow for a break in between the workshop sections)
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
              <Input 
                type="time" 
                step={300}
                value={timeValue} 
                onChange={e => { setTimeValue(e.target.value); markEdited("workshop_time", e.target.value, isClockTime ? rawTimeValue.trim() : "") }} 
                onBlur={() => handleSave("workshop_time", timeValue, qTime?.current?.value)}
                disabled={isReadOnly || initialAnswers.school.locked}
                className="print:border-none print:p-0 print:h-auto"
              />
            </div>
            
            {timeValue && (
              <div className="bg-primary/5 text-primary p-3 rounded-md font-medium text-sm border border-primary/20">
                Calculated Schedule: <br/>
                {computeBreakTimes(timeValue)}
              </div>
            )}

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
            
            {renderSectionSave(["workshop_time", "timing_note"], () => {
              handleSave("workshop_time", timeValue, qTime?.current?.value)
              handleSave("timing_note", timingNote, qNote?.current?.value)
            })}

            {qTime?.current && (
              <div className="text-xs text-muted-foreground no-print">
                Last updated by {qTime.current.enteredBy} at {formatPacificTime(qTime.current.enteredAt)}
              </div>
            )}
          </div>
          {renderWorkshopTimeHistory(qTime, qNote)}
        </CardContent>
      </Card>

      {/* Activity Area */}
      <Card className="border-l-4 border-l-primary print:shadow-none print:border-b-2 print:border-l-0 print:border-black print:rounded-none">
        <CardHeader className="print:px-0">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Area for activity stations</CardTitle>
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
              <CardTitle>An additional separate area for speakers</CardTitle>
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
            <CardTitle>Anything else we should know?</CardTitle>
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
  )
}
