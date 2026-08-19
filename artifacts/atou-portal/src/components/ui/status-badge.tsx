import * as React from "react"
import { AlertCircle, CheckCircle2, Circle } from "lucide-react"

export function StatusBadge({ complete, text }: { complete: boolean, text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider border transition-colors ${complete ? 'bg-primary/10 text-primary border-primary/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}>
      {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
      {text}
    </span>
  )
}