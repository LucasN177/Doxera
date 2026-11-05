/** Subtle version and author note in the bottom-right corner. */
export function AppCredits() {
  return (
    <p className="text-muted-foreground pointer-events-none fixed right-[max(1.5rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-0 text-[11px] select-none">
      v{__APP_VERSION__} · by Lucas Nagelsmann
    </p>
  )
}
