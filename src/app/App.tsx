import { FileText } from 'lucide-react'

export function App() {
  return (
    <main className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <FileText className="text-primary size-12" aria-hidden />
      <h1 className="text-3xl font-semibold tracking-tight">Doxera</h1>
      <p className="text-muted-foreground">A smarter way to work with documents.</p>
    </main>
  )
}
