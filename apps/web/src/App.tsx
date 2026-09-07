import { useEffect } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

import { AppShell } from '@/components/AppShell';
import { ErrorBoundary } from '@/components/error-boundary';
import { UiProvider, useUi } from '@/context/UiContext';
import { RuleSetsProvider } from '@/hooks/use-rulesets';
import { Author } from '@/pages/Author';
import { Build } from '@/pages/Build';
import { Check } from '@/pages/Check';
import NotFound from '@/pages/not-found';

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
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <RuleSetsProvider>
        <UiProvider>
          <Router />
        </UiProvider>
      </RuleSetsProvider>
    </WouterRouter>
  );
}

export default App;
