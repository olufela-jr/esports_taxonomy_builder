import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// A tab opened before a deploy asks for screen files the new release no longer
// has. Reload once to pick up the new release; a second failure within ten
// seconds is left to the error boundary, so a real outage cannot loop.
const RELOAD_KEY = 'campaign-naming-chunk-reload';
window.addEventListener('vite:preloadError', (event) => {
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // Storage unavailable: still reload once.
  }
  if (Date.now() - last < 10_000) return;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: the reload still helps.
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
