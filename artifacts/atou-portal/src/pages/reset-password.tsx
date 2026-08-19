import { useMemo, useState } from "react"
import { Link, useLocation, useSearch } from "wouter"
import { useAdminResetPassword } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AtouLogo } from "@/components/shared/atou-logo"
import { PasswordInput } from "@/components/shared/password-input"
import { useToast } from "@/hooks/use-toast"

export function ResetPassword() {
  const search = useSearch()
  const token = useMemo(() => new URLSearchParams(search).get("token") ?? "", [search])
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const reset = useAdminResetPassword()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("The new password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("The passwords don't match.")
      return
    }
    reset.mutate({ data: { token, password } }, {
      onSuccess: () => {
        toast({
          title: "Password updated",
          description: "You can now sign in with your new password."
        })
        setLocation("/")
      },
      onError: (err) => {
        const body = (err as { data?: { error?: string } })?.data
        setError(body?.error ?? "Something went wrong. Please try again.")
      }
    })
  }

  const invalidLink = !token

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-background relative overflow-hidden">
      <div className="absolute -top-36 -right-28 h-80 w-80 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-44 -left-28 h-96 w-96 rounded-full bg-secondary/10 blur-3xl" aria-hidden="true" />
      <div className="w-full max-w-md space-y-8 relative">
        <div className="text-center space-y-2">
          <AtouLogo className="mx-auto h-24 w-24 mb-5 drop-shadow-md" />
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">A Touch of Understanding</h1>
          <p className="text-primary font-bold uppercase tracking-[0.16em] text-xs mt-2">Workshop Logistics Admin</p>
        </div>

        <Card className="border-t-8 border-x-border border-b-border rounded-2xl shadow-lg border-t-primary">
          <CardHeader>
            <CardTitle>Set a New Password</CardTitle>
            <CardDescription>Choose a new password for your admin account.</CardDescription>
          </CardHeader>
          <CardContent>
            {invalidLink ? (
              <div className="space-y-4">
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-4">
                  This reset link is missing its token. Please use the full link from your email, or request a new one.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/forgot-password">Request a New Link</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <PasswordInput
                    id="new-password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="bg-muted/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <PasswordInput
                    id="confirm-password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    className="bg-muted/20"
                  />
                </div>
                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 space-y-2">
                    <p>{error}</p>
                    <Link href="/forgot-password" className="underline block">Request a new reset link</Link>
                  </div>
                )}
                <Button type="submit" className="w-full h-12 text-base font-bold shadow-md hover:shadow-lg transition-all" disabled={reset.isPending}>
                  {reset.isPending ? "Updating..." : "Update Password"}
                </Button>
                <div className="text-center">
                  <Link href="/" className="text-sm text-primary hover:underline">Back to Sign In</Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
