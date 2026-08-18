import { Link, useLocation } from "wouter"
import { useGetAdminMe, useAdminLogout, getGetAdminMeQueryKey } from "@workspace/api-client-react"
import { Users, FileText, Settings, LogOut, Send, LayoutDashboard, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { cn } from "@/lib/utils"

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation()
  const { data: user, isLoading } = useGetAdminMe({ query: { retry: false, queryKey: getGetAdminMeQueryKey() } })
  const logout = useAdminLogout()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  if (isLoading) return <div className="min-h-screen flex items-center justify-center p-4"><div className="animate-pulse">Loading...</div></div>

  if (!user) {
    if (location !== "/") setLocation("/")
    return null
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/"
      }
    })
  }

  const navLinks = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/send", label: "Send Links", icon: Send },
    { href: "/admin/pages", label: "Info Pages", icon: FileText },
    { href: "/admin/admins", label: "Admin Users", icon: Users },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ]

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background print:bg-white print:block">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card no-print">
        <div className="font-serif font-semibold text-lg text-primary">ATOU Logistics</div>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          <Menu className="h-6 w-6" />
        </Button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-card border-r flex-col shadow-sm transition-transform duration-200 ease-in-out md:relative md:flex md:translate-x-0 no-print",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b hidden md:block">
          <h1 className="font-serif text-xl font-semibold text-primary">ATOU Logistics</h1>
          <p className="text-xs text-muted-foreground mt-1">A Touch of Understanding</p>
        </div>
        <div className="p-4 flex-1 flex flex-col gap-1 overflow-y-auto">
          {navLinks.map((link) => {
            const Icon = link.icon
            const active = location === link.href || (link.href !== "/admin" && location.startsWith(link.href))
            return (
              <Link key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)}>
                <span className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}>
                  <Icon className="h-4 w-4" />
                  {link.label}
                </span>
              </Link>
            )
          })}
        </div>
        <div className="p-4 border-t">
          <p className="text-xs text-muted-foreground mb-3 px-2 break-all">{user.email}</p>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
      
      {/* Overlay for mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/20 z-30 md:hidden no-print" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 print:block">
        <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full print:p-0 print:m-0 print:max-w-none">
          {children}
        </div>
      </main>
    </div>
  )
}