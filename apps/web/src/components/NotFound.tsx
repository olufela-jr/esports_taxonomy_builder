import { AlertCircle } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="mx-4 w-full max-w-md rounded-xl border border-card-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex gap-2">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <h1 className="font-serif text-2xl font-semibold text-foreground">404 Page Not Found</h1>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">This page is not part of the current workspace.</p>
      </div>
    </div>
  );
}
