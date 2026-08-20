import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// "one" through "ten" spelled out for the missing-teacher-count note
// (shared by the entry form and the confirmation screen); numerals beyond.
export const missingCountWord = (n: number) =>
  ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n - 1] ?? String(n)

export function formatPacificTime(dateString: string | null | undefined): string {
  if (!dateString) return "N/A"
  try {
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
