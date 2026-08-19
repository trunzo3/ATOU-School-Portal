import { useState } from "react"
import { Link } from "wouter"
import { useAdminForgotPassword } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AtouLogo } from "@/components/shared/atou-logo"

export function ForgotPassword() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const forgot = useAdminForgotPassword()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    forgot.mutate({ data: { email } }, {
      onSuccess: (data) => {
        setMessage(data.message)
      },
      onError: (error) => {
        const body = (error as { data?: { message?: string; error?: string } })?.data
        setMessage(
          body?.message ??
          body?.error ??
          "Something went wrong. Please try again in a few minutes."
        )
      }
    })
  }

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
            <CardTitle>Forgot Password</CardTitle>
            <CardDescription>
              Enter your email and we'll send you a link to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {message ? (
              <div className="space-y-4">
                <p className="text-sm text-foreground bg-muted/40 rounded-lg p-4">{message}</p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">Back to Sign In</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-muted/20"
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-base font-bold shadow-md hover:shadow-lg transition-all" disabled={forgot.isPending}>
                  {forgot.isPending ? "Sending..." : "Send Reset Link"}
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
