import { useRef } from "react"
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
  // Called once focus leaves the whole picker (mirrors the old input onBlur save)
  onBlurCommit?: (value: string) => void
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

const pad = (n: number) => String(n).padStart(2, "0")

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

export function TimePicker({ value, onChange, onBlurCommit, disabled, className, "aria-label": ariaLabel }: TimePickerProps) {
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
    onChange(toValue(next.hour12, next.minute, next.period))
  }

  // How many of THIS picker's dropdowns are currently open. Commit only when
  // none are open and focus has left the picker — checked both on blur and
  // whenever one of our dropdowns closes, so a change made just before
  // clicking away still gets saved.
  const openCountRef = useRef(0)

  const maybeCommit = () => {
    // Wait a tick so focus lands before we check where it went.
    setTimeout(() => {
      if (openCountRef.current > 0) return
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const active = document.activeElement
      if (active && wrapper.contains(active)) return
      onBlurCommit?.(valueRef.current)
    }, 0)
  }

  const handleOpenChange = (open: boolean) => {
    openCountRef.current = Math.max(0, openCountRef.current + (open ? 1 : -1))
    if (!open) maybeCommit()
  }

  const fmtPrint = parsed ? `${parsed.hour12}:${pad(parsed.minute)} ${parsed.period}` : ""

  return (
    <div className={className}>
      <div
        ref={wrapperRef}
        onBlur={maybeCommit}
        role="group"
        aria-label={ariaLabel}
        className="flex items-center gap-2 print:hidden"
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
