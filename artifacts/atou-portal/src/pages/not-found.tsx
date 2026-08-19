import { Link } from "wouter"
import { FileQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-6 max-w-md p-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 bg-secondary/10 rounded-full flex items-center justify-center ring-8 ring-secondary/5">
            <FileQuestion className="h-10 w-10 text-secondary" />
          </div>
        </div>
        <h1 className="text-3xl font-serif font-bold">Page Not Found</h1>
        <p className="text-muted-foreground text-lg">
          The link you followed may be incorrect, or the page has been moved.
        </p>
        <div className="pt-4">
          <Link href="/">
            <Button>Return Home</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}