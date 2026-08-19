import { useEffect, useRef } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// A time picker with an hour dropdown (1-12), a minute dropdown in 5-minute
// steps, and an AM/PM toggle. The value stays in 24-hour "HH:MM" format so
// everything downstream (parsing, history, backend) is unchanged.

interface TimePickerProps {
  value: string // "HH:MM" in 24-hour time, or "" when unset
  onChange: (value: string) => void
  // Called once per edit session, when the person is truly done with the
  // whole control: focus or a click lands somewhere outside it. Moving
  // between the hour/minute/AM-PM parts, or pausing inside the control,
  // does NOT end the session.
  onSessionEnd?: (value: string) => void
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

const pad = (n: number) => String(n).padStart(2, "0")

// True when an element lives inside a dropdown's portaled content (rendered
// outside the picker wrapper in the DOM). Clicks/focus there are part of
// using the picker, never a reason to end the edit session. While a foreign
// dropdown is open the picker's own session has already ended (the click on
// its trigger was an outside interaction), so this check is safe globally.
const isInDropdownPortal = (el: Element) =>
  Boolean(el.closest('[data-radix-popper-content-wrapper], [role="listbox"]'))

function parseValue(value: string): { hour12: number; minute: number; period: "AM" | "PM" } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value || "").trim())
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (h > 23 || mm > 59) return null
  return { hour12: ((h + 11) % 12) + 1, minute: mm, period: h >= 12 ? "PM" : "AM" }
}

function toValue(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h = hour12 % 12
  if (period === "PM") h += 12
  return `${pad(h)}:${pad(minute)}`
}

export function TimePicker({ value, onChange, onSessionEnd, disabled, className, "aria-label": ariaLabel }: TimePickerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const parsed = parseValue(value)

  // Minute options: 5-minute steps, plus the current minute if it doesn't
  // land on one (e.g. an answer saved before this picker existed).
  const minutes: number[] = []
  for (let m = 0; m < 60; m += 5) minutes.push(m)
  if (parsed && !minutes.includes(parsed.minute)) {
    minutes.push(parsed.minute)
    minutes.sort((a, b) => a - b)
  }

  const update = (part: Partial<{ hour12: number; minute: number; period: "AM" | "PM" }>) => {
    const base = parsed ?? { hour12: 8, minute: 0, period: "AM" as const }
    const next = { ...base, ...part }
    sessionActiveRef.current = true
    onChange(toValue(next.hour12, next.minute, next.period))
  }

  // How many of THIS picker's dropdowns are currently open. While one is
  // open, clicks and focus land in its portaled content (outside the
  // wrapper in the DOM), so outside-detection must be paused.
  const openCountRef = useRef(0)

  // An edit session starts when the person interacts with the picker and
  // ends only when focus or a click positively lands OUTSIDE the whole
  // control. Momentary "focus is nowhere" states (which happen between a
  // dropdown closing and Radix restoring focus to the trigger) never end
  // the session — that was the cause of one-history-entry-per-part saves.
  const sessionActiveRef = useRef(false)
  const onSessionEndRef = useRef(onSessionEnd)
  onSessionEndRef.current = onSessionEnd

  useEffect(() => {
    const handleOutside = (target: EventTarget | null) => {
      if (!sessionActiveRef.current) return
      if (openCountRef.current > 0) return
      const wrapper = wrapperRef.current
      if (!wrapper) return
      if (target instanceof Node && wrapper.contains(target)) return
      if (target instanceof Element && isInDropdownPortal(target)) return
      sessionActiveRef.current = false
      onSessionEndRef.current?.(valueRef.current)
    }
    const onPointerDown = (e: PointerEvent) => handleOutside(e.target)
    const onFocusIn = (e: FocusEvent) => handleOutside(e.target)
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("focusin", onFocusIn, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("focusin", onFocusIn, true)
    }
  }, [])

  const handleOpenChange = (open: boolean) => {
    openCountRef.current = Math.max(0, openCountRef.current + (open ? 1 : -1))
    if (open) {
      sessionActiveRef.current = true
      return
    }
    // A dropdown just closed. If it was dismissed by an interaction outside
    // the control (non-modal outside click), the document listeners above
    // skipped it because the dropdown was still open — so re-check once
    // focus has settled. Only a POSITIVE "focus is on a real element
    // outside the wrapper" ends the session; focus resting on <body> (the
    // transient state while Radix restores focus to the trigger) never does.
    setTimeout(() => {
      if (!sessionActiveRef.current || openCountRef.current > 0) return
      const wrapper = wrapperRef.current
      const active = document.activeElement
      if (!wrapper || !(active instanceof Element) || active === document.body) return
      if (wrapper.contains(active)) return
      // The just-closed dropdown's portal can still hold focus for a beat
      // before Radix returns it to the trigger — that is NOT "outside".
      if (isInDropdownPortal(active)) return
      sessionActiveRef.current = false
      onSessionEndRef.current?.(valueRef.current)
    }, 0)
  }

  const fmtPrint = parsed ? `${parsed.hour12}:${pad(parsed.minute)} ${parsed.period}` : ""

  return (
    <div className={className}>
      <div
        ref={wrapperRef}
        onFocus={() => { sessionActiveRef.current = true }}
        role="group"
        aria-label={ariaLabel}
        className="flex flex-wrap items-center gap-2 print:hidden"
      >
        <Select
          value={parsed ? String(parsed.hour12) : ""}
          onValueChange={v => update({ hour12: Number(v) })}
          onOpenChange={handleOpenChange}
          disabled={disabled}
        >
          <SelectTrigger className="w-[4.5rem]" aria-label="Hour">
            <SelectValue placeholder="Hour" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
              <SelectItem key={h} value={String(h)}>{h}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground font-medium" aria-hidden="true">:</span>
        <Select
          value={parsed ? String(parsed.minute) : ""}
          onValueChange={v => update({ minute: Number(v) })}
          onOpenChange={handleOpenChange}
          disabled={disabled}
        >
          <SelectTrigger className="w-[4.5rem]" aria-label="Minutes">
            <SelectValue placeholder="Min" />
          </SelectTrigger>
          <SelectContent>
            {minutes.map(m => (
              <SelectItem key={m} value={String(m)}>{pad(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex rounded-lg border border-input overflow-hidden" role="group" aria-label="AM or PM">
          {(["AM", "PM"] as const).map(p => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              aria-pressed={parsed?.period === p}
              onClick={() => update({ period: p })}
              className={cn(
                "px-3 h-10 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-75",
                parsed?.period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <span className="hidden print:inline text-sm">{fmtPrint || "Not provided"}</span>
    </div>
  )
}

