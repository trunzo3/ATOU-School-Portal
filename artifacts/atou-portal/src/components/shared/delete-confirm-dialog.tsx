import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Destructive-action confirmation: the user must type "delete" before the
// confirm button becomes active.
export function DeleteConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  pending = false,
}: {
  trigger: ReactNode
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  pending?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const confirmed = text.trim().toLowerCase() === "delete"

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setText("")
  }

  const handleConfirm = () => {
    if (!confirmed) return
    onConfirm()
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-confirm-input">
            Type <span className="font-mono font-bold text-destructive">delete</span> to confirm
          </Label>
          <Input
            id="delete-confirm-input"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleConfirm()
              }
            }}
            placeholder="delete"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="rounded-full"
            disabled={!confirmed || pending}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
