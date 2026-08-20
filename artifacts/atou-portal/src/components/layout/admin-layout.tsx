import { Link, useLocation } from "wouter"
import { useGetAdminMe, useAdminLogout, getGetAdminMeQueryKey } from "@workspace/api-client-react"
import { Users, FileText, Settings, LogOut, Send, LayoutDashboard, Menu, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AtouLogo } from "@/components/shared/atou-logo"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation()
  const { data: user, isLoading } = useGetAdminMe({ query: { retry: false, queryKey: getGetAdminMeQueryKey() } })
  const logout = useAdminLogout()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Redirect signed-out visitors from an effect, not mid-render: React warns
  // about (and may drop) navigation state changes made while rendering.
  useEffect(() => {
    if (!isLoading && !user && location !== "/") setLocation("/")
  }, [isLoading, user, location, setLocation])

  if (isLoading) return <div className="min-h-screen flex items-center justify-center p-4"><div className="animate-pulse">Loading...</div></div>

  if (!user) return null

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/"
      }
    })
  }

  const navLinks = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/summary", label: "Snapshot", icon: ClipboardList },
    { href: "/admin/send", label: "Send Emails", icon: Send },
    { href: "/admin/pages", label: "Info Pages", icon: FileText },
    { href: "/admin/admins", label: "Admin Users", icon: Users },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ]

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background print:bg-white print:block">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card no-print shadow-sm z-50 relative">
        <a
          href="https://touchofunderstanding.org/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit A Touch of Understanding website"
          className="flex items-center gap-2"
        >
          <AtouLogo className="h-10 w-10 flex-shrink-0 drop-shadow-sm" />
          <div>
            <div className="font-serif font-bold text-lg text-foreground tracking-tight leading-none">ATOU Logistics</div>
            <div className="text-[10px] text-primary font-bold uppercase tracking-[0.16em] mt-1">Admin Portal</div>
          </div>
        </a>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-full"
          aria-label={mobileMenuOpen ? "Close admin navigation" : "Open admin navigation"}
          aria-expanded={mobileMenuOpen}
          aria-controls="admin-navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed top-[65px] bottom-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col shadow-xl transition-transform duration-200 ease-in-out md:sticky md:inset-y-0 md:h-[100dvh] md:translate-x-0 no-print",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )} id="admin-navigation">
        <div className="p-6 border-b border-sidebar-border hidden md:block">
          <a
            href="https://touchofunderstanding.org/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit A Touch of Understanding website"
            className="flex items-center gap-3 mb-2"
          >
            <AtouLogo className="h-12 w-12 flex-shrink-0 drop-shadow-md" />
            <h1 className="font-serif text-xl font-bold text-sidebar-foreground tracking-tight">ATOU Logistics</h1>
          </a>
          <p className="text-[10px] text-primary font-bold uppercase tracking-[0.16em]">A Touch of Understanding</p>
        </div>
        <div className="p-4 flex-1 flex flex-col gap-1.5 overflow-y-auto">
          {navLinks.map((link) => {
            const Icon = link.icon
            const active = location === link.href || (link.href !== "/admin" && location.startsWith(link.href))
            return (
              <Link key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)}>
                <span className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}>
                  <Icon className="h-4 w-4" />
                  {link.label}
                </span>
              </Link>
            )
          })}
        </div>
        <div className="p-4 border-t border-sidebar-border bg-black/10">
          <p className="text-xs text-sidebar-foreground/65 mb-3 px-2 break-all font-medium">{user.email}</p>
          <Button variant="outline" className="w-full justify-start gap-2 border-white/20 bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
      
      {/* Overlay for mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-brand-navy/45 backdrop-blur-[1px] z-30 md:hidden no-print" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background print:block">
        <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full print:p-0 print:m-0 print:max-w-none">
          {children}
        </div>
      </main>
    </div>
  )
}