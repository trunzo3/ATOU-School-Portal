import { useState } from "react"
import { Link, useLocation } from "wouter"
import { useAdminLogin, useAdminDevLogin } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/shared/password-input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AtouLogo } from "@/components/shared/atou-logo"
import { useToast } from "@/hooks/use-toast"

export function AdminLogin() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  
  const login = useAdminLogin()
  const devLogin = useAdminDevLogin()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    login.mutate({ data: { email, password } }, {
      onSuccess: () => {
        setLocation("/admin")
      },
      onError: () => {
        toast({
          title: "Sign in failed",
          description: "Please check your email and password.",
          variant: "destructive"
        })
      }
    })
  }

  const handleDevLogin = () => {
    devLogin.mutate(undefined, {
      onSuccess: () => {
        setLocation("/admin")
      },
      onError: () => {
        toast({ title: "Dev login failed", variant: "destructive" })
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-background relative overflow-hidden">
      <div className="absolute -top-36 -right-28 h-80 w-80 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-44 -left-28 h-96 w-96 rounded-full bg-secondary/10 blur-3xl" aria-hidden="true" />
      <div className="w-full max-w-md space-y-8 relative">
        <div className="text-center space-y-2">
          <a
            href="https://touchofunderstanding.org/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit A Touch of Understanding website"
            className="block"
          >
            <AtouLogo className="mx-auto h-24 w-24 mb-5 drop-shadow-md" />
          </a>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">A Touch of Understanding</h1>
          <p className="text-primary font-bold uppercase tracking-[0.16em] text-xs mt-2">Workshop Logistics Admin</p>
        </div>
        
        <Card className="border-t-8 border-x-border border-b-border rounded-2xl shadow-lg border-t-primary">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Program coordinators, please sign in to manage workshops.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
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
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-muted/20"
                />
                <div className="text-right">
                  <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </div>
              <Button type="submit" className="w-full h-12 text-base font-bold shadow-md hover:shadow-lg transition-all" disabled={login.isPending}>
                {login.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <div className="border-t pt-6 text-center">
          <Button variant="outline" className="text-xs rounded-full" onClick={handleDevLogin} disabled={devLogin.isPending}>
            Developer Login (Pam)
          </Button>
        </div>
      </div>
    </div>
  )
}
