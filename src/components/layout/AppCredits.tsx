/** Subtle version and author note in the bottom-right corner. */
export function AppCredits() {
  return (
    <p className="text-muted-foreground/70 pointer-events-none fixed right-6 bottom-4 z-0 text-[11px] select-none">
      v{__APP_VERSION__} · by Lucas Nagelsmann
    </p>
  )
}
