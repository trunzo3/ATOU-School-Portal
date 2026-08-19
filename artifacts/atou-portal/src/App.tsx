import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import { AdminLogin } from "@/pages/admin-login"
import { ForgotPassword } from "@/pages/forgot-password"
import { ResetPassword } from "@/pages/reset-password"
import { AdminDashboard } from "@/pages/admin-dashboard"
import { AdminSchoolDetail } from "@/pages/admin-school-detail"
import { AdminSend } from "@/pages/admin-send"
import { AdminPages } from "@/pages/admin-pages"
import { AdminUsers } from "@/pages/admin-users"
import { AdminSettings } from "@/pages/admin-settings"
import { PortalEntry } from "@/pages/portal-entry"
import { PortalDone } from "@/pages/portal-done"
import { PortalPage } from "@/pages/portal-page"

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        {/* Admin Routes */}
        <Route path="/" component={AdminLogin} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/schools/:id" component={AdminSchoolDetail} />
        <Route path="/admin/send" component={AdminSend} />
        <Route path="/admin/pages" component={AdminPages} />
        <Route path="/admin/admins" component={AdminUsers} />
        <Route path="/admin/settings" component={AdminSettings} />
        
        {/* Portal Routes */}
        <Route path="/s/:code" component={PortalEntry} />
        <Route path="/s/:code/done" component={PortalDone} />
        <Route path="/s/:code/pages/:slug" component={PortalPage} />

        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;