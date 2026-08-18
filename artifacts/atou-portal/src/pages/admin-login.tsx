import { useState } from "react"
import { useLocation } from "wouter"
import { useAdminLogin, useAdminDevLogin } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-serif font-semibold text-primary">A Touch of Understanding</h1>
          <p className="text-muted-foreground">Workshop Logistics Portal</p>
        </div>
        
        <Card>
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
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                />
              </div>
              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <div className="border-t pt-8">
          <Button variant="outline" className="w-full text-muted-foreground" onClick={handleDevLogin} disabled={devLogin.isPending}>
            Temporary: log in as Pam (development only)
          </Button>
        </div>
      </div>
    </div>
  )
}