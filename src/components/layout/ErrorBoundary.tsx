import { TriangleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/** Last line of defense: shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unerwarteter Fehler', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div
        role="alert"
        className="bg-background text-foreground flex h-svh flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <TriangleAlert className="text-destructive size-10" aria-hidden />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">{t('Da ist etwas schiefgelaufen')}</h1>
          <p className="text-muted-foreground max-w-md text-sm">
            {t(
              'Doxera ist auf einen unerwarteten Fehler gestoßen. Deine lokal gespeicherten Dokumente sind davon nicht betroffen.',
            )}
          </p>
        </div>
        <details className="text-muted-foreground max-w-md text-left text-xs">
          <summary className="cursor-pointer">{t('Technische Details')}</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap">{this.state.error.message}</pre>
        </details>
        <Button onClick={() => window.location.reload()}>{t('Neu laden')}</Button>
      </div>
    )
  }
}
