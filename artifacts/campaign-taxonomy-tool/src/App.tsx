import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

import { AppShell } from '@/components/AppShell';
import { UiProvider, useUi } from '@/context/UiContext';
import { Author } from '@/pages/Author';
import { Build } from '@/pages/Build';
import { Check } from '@/pages/Check';
import { useEffect } from 'react';

import { RuleSetsProvider } from '@/hooks/use-rulesets';

const queryClient = new QueryClient();

function DefaultRouteRedirect() {
  const { lastAction } = useUi();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (location === '/') {
      setLocation(lastAction || '/author');
    }
  }, [location, lastAction, setLocation]);

  return null;
}

function Router() {
  return (
    <AppShell>
      <ErrorBoundary resetKey={window.location.pathname}>
        <DefaultRouteRedirect />
        <Switch>
          <Route path="/author"><Author /></Route>
          <Route path="/build"><Build /></Route>
          <Route path="/check"><Check /></Route>
          <Route path="/"><Author /></Route>
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RuleSetsProvider>
            <UiProvider>
              <Router />
            </UiProvider>
          </RuleSetsProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;