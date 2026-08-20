import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// "one" through "ten" spelled out for the missing-teacher-count note
// (shared by the entry form and the confirmation screen); numerals beyond.
export const missingCountWord = (n: number) =>
  ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n - 1] ?? String(n)

// "16:00" -> "4:00 PM" (plain HH:MM values, no timezone involved)
export function formatTime12h(value: string): string {
  const [h, m] = value.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value
  const period = h >= 12 ? "PM" : "AM"
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`
}

export function formatPacificTime(dateString: string | null | undefined): string {
  if (!dateString) return "N/A"
  try {
    // Date-only values (YYYY-MM-DD, e.g. workshop dates) carry no time or
    // timezone. Parsing them as timestamps lands at midnight UTC, which is
    // the previous evening in Pacific time and shifts the calendar day back
    // by one. Format them as plain calendar dates instead.
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${dateString}T00:00:00Z`))
    }
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(date)
  } catch {
    return dateString
  }
}
