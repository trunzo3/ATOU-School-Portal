import * as React from "react"
import { AlertCircle, CheckCircle2, Circle } from "lucide-react"

export function StatusBadge({ complete, text, neutral = false }: { complete: boolean, text: string, neutral?: boolean }) {
  const style = complete
    ? 'bg-primary/10 text-primary border-primary/20'
    : neutral
      ? 'bg-muted text-muted-foreground border-border'
      : 'bg-destructive/10 text-destructive border-destructive/20'
  const Icon = complete ? CheckCircle2 : neutral ? Circle : AlertCircle
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider border transition-colors ${style}`}>
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  )
}