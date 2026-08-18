import { Link } from "wouter"
import { FileQuestion } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#faf8f5] text-[#1c232e]">
      <div className="text-center space-y-6 max-w-md p-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 bg-[#325566]/10 rounded-full flex items-center justify-center">
            <FileQuestion className="h-10 w-10 text-[#325566]" />
          </div>
        </div>
        <h1 className="text-3xl font-serif font-bold">Page Not Found</h1>
        <p className="text-muted-foreground text-lg">
          The link you followed may be incorrect, or the page has been moved.
        </p>
        <div className="pt-4">
          <Link href="/">
            <a className="inline-flex h-10 items-center justify-center rounded-md bg-[#325566] px-8 text-sm font-medium text-white transition-colors hover:bg-[#325566]/90">
              Return Home
            </a>
          </Link>
        </div>
      </div>
    </div>
  )
}