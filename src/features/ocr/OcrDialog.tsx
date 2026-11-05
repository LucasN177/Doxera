import { ScanText } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { OCR_LANGUAGES, type OcrLanguage } from '@/engine/ocr/tesseract'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import { runOcr, type OcrProgress } from './runOcr'
import { t } from '@/i18n'

type Target = 'all' | 'selected' | 'current'

const LANGUAGES_KEY = 'doxera:ocr-languages'
const DEFAULT_LANGUAGES: OcrLanguage[] = ['deu', 'eng']

function loadLanguages(): OcrLanguage[] {
  try {
    const stored = JSON.parse(localStorage.getItem(LANGUAGES_KEY) ?? 'null') as unknown
    const known = OCR_LANGUAGES.map((language) => language.code as string)
    if (Array.isArray(stored)) {
      const valid = stored.filter((code): code is OcrLanguage => known.includes(code as string))
      if (valid.length > 0) return valid
    }
  } catch {
    // Storage blocked or invalid: use the defaults
  }
  return DEFAULT_LANGUAGES
}

function saveLanguages(languages: readonly OcrLanguage[]) {
  try {
    localStorage.setItem(LANGUAGES_KEY, JSON.stringify(languages))
  } catch {
    // Not essential
  }
}

export function OcrDialog() {
  const open = useUiStore((state) => state.ocrOpen)
  const setOpen = useUiStore((state) => state.setOcrOpen)
  const running = useRef<AbortController | null>(null)
  const close = (next: boolean) => {
    if (next) return setOpen(true)
    running.current?.abort()
    setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      {open && (
        <OcrDialogContent
          onRun={(controller) => {
            running.current = controller
          }}
          onCancel={() => running.current?.abort()}
          onDone={() => setOpen(false)}
        />
      )}
    </Dialog>
  )
}

function OcrDialogContent({
  onRun,
  onCancel,
  onDone,
}: {
  /** Reports the running recognition, so closing the dialog can cancel it. */
  onRun: (controller: AbortController | null) => void
  onCancel: () => void
  onDone: () => void
}) {
  const pageCount = useDocumentStore((state) => state.document?.pages.length ?? 0)
  const selectedIds = useViewerStore((state) => state.selectedIds)
  const [languages, setLanguages] = useState<OcrLanguage[]>(loadLanguages)
  const [target, setTarget] = useState<Target>(selectedIds.length > 1 ? 'selected' : 'all')
  const [skipText, setSkipText] = useState(true)
  const [progress, setProgress] = useState<OcrProgress | null>(null)

  const toggleLanguage = (code: OcrLanguage) =>
    setLanguages((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    )

  const pageIds = (): string[] => {
    const pages = useDocumentStore.getState().document?.pages ?? []
    if (target === 'selected' && selectedIds.length > 0) return selectedIds
    if (target === 'current') {
      const page = pages[useViewerStore.getState().currentPage - 1]
      return page ? [page.id] : []
    }
    return pages.map((page) => page.id)
  }

  const start = async () => {
    saveLanguages(languages)
    const controller = new AbortController()
    onRun(controller)
    setProgress({ current: 1, total: 1, page: 0, phase: 'loading' })
    try {
      const summary = await runOcr({
        pageIds: pageIds(),
        languages,
        skipPagesWithText: skipText,
        onProgress: setProgress,
        signal: controller.signal,
      })
      const notes = [
        summary.skipped > 0 &&
          (summary.skipped === 1
            ? t('1 Seite hatte schon Text')
            : t('{count} Seiten hatten schon Text', { count: summary.skipped })),
        summary.empty > 0 &&
          (summary.empty === 1
            ? t('auf 1 Seite kein Text gefunden')
            : t('auf {count} Seiten kein Text gefunden', { count: summary.empty })),
      ].filter(Boolean)
      if (summary.recognized > 0) {
        toast.success(
          summary.recognized === 1
            ? t('Text auf 1 Seite erkannt')
            : t('Text auf {count} Seiten erkannt', { count: summary.recognized }),
          {
            description: [
              t('Er ist jetzt durchsuchbar und markierbar – auch in der exportierten PDF.'),
              ...notes,
            ].join(' '),
          },
        )
      } else {
        toast.info(t('Kein Text erkannt'), { description: notes.join(', ') || undefined })
      }
      onDone()
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        toast.info(t('Texterkennung abgebrochen'))
      } else {
        console.error('Texterkennung fehlgeschlagen', error)
        toast.error(t('Die Texterkennung ist fehlgeschlagen.'), {
          description: navigator.onLine
            ? undefined
            : t(
                'Beim ersten Mal werden die Erkennungsdaten geladen – dafür ist eine Verbindung nötig.',
              ),
        })
      }
      setProgress(null)
    } finally {
      onRun(null)
    }
  }

  const percent = progress
    ? Math.round(((progress.current - 1 + progress.page) / progress.total) * 100)
    : 0

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('Texterkennung (OCR)')}</DialogTitle>
        <DialogDescription>
          {t(
            'Erkennt Text auf gescannten Seiten und macht ihn durchsuchbar, markierbar und kopierbar. Alles läuft lokal in deinem Browser.',
          )}
        </DialogDescription>
      </DialogHeader>

      {progress ? (
        <div className="space-y-3 py-2" aria-live="polite">
          <div className="flex items-center gap-3">
            <ScanText className="text-primary size-5 animate-pulse" aria-hidden />
            <p className="text-sm">
              {progress.phase === 'loading'
                ? t('Erkennung wird vorbereitet …')
                : progress.phase === 'saving'
                  ? t('Textebene wird eingefügt …')
                  : t('Seite {current} von {total} wird erkannt …', {
                      current: progress.current,
                      total: progress.total,
                    })}
            </p>
          </div>
          <div
            className="bg-muted h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              {t('Abbrechen')}
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{t('Sprachen im Dokument')}</legend>
              <div className="flex flex-wrap gap-2">
                {OCR_LANGUAGES.map(({ code, name }) => {
                  const selected = languages.includes(code)
                  return (
                    <Button
                      key={code}
                      type="button"
                      size="sm"
                      variant={selected ? 'secondary' : 'outline'}
                      className={cn(selected && 'ring-ring ring-1')}
                      aria-pressed={selected}
                      onClick={() => toggleLanguage(code)}
                    >
                      {name}
                    </Button>
                  )
                })}
              </div>
              <p className="text-muted-foreground text-xs">
                {t('Mehr Sprachen machen die Erkennung langsamer.')}
              </p>
            </fieldset>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{t('Seiten')}</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {(
                  [
                    ['all', t('Alle ({pageCount})', { pageCount })],
                    ...(selectedIds.length > 0
                      ? [
                          [
                            'selected',
                            t('Ausgewählte ({length})', { length: selectedIds.length }),
                          ] as const,
                        ]
                      : []),
                    ['current', t('Aktuelle Seite')],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    role="radio"
                    aria-checked={target === value}
                    variant={target === value ? 'secondary' : 'outline'}
                    className={cn(target === value && 'ring-ring ring-1')}
                    onClick={() => setTarget(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary mt-0.5 size-4"
                checked={skipText}
                onChange={(event) => setSkipText(event.target.checked)}
              />
              <span>
                {t('Seiten mit vorhandenem Text überspringen')}
                <span className="text-muted-foreground block text-xs">
                  {t('Digitale PDFs haben schon Text; nur Scans brauchen eine Erkennung.')}
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onDone}>
              {t('Abbrechen')}
            </Button>
            <Button onClick={() => void start()} disabled={languages.length === 0}>
              {t('Text erkennen')}
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  )
}
