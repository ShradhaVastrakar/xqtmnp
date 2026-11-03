import type { ReactNode } from "react";

export function Loading({ label = "Loading…", height = 240 }: { label?: string; height?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 text-sm text-ink-3" style={{ height }}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-red-300/60 bg-red-50 p-4 text-sm text-red-900 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200">
      <p><strong className="font-semibold">Couldn’t load data.</strong> {message}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-md border border-current px-3 py-1 text-xs font-medium hover:bg-white/50 dark:hover:bg-white/10">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, height = 200 }: { title: string; children?: ReactNode; height?: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 text-center text-sm text-ink-3" style={{ minHeight: height }}>
      <p className="font-medium text-ink-2">{title}</p>
      {children && <p className="max-w-md">{children}</p>}
    </div>
  );
}
