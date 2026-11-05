import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  DEFAULT_HEADER_FOOTER,
  hasStamps,
  HEADER_FOOTER_PRESETS,
  type HeaderFooter,
} from '@/engine/document/headerFooter'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { locale, t } from '@/i18n'

export function HeaderFooterDialog() {
  const open = useUiStore((state) => state.headerFooterOpen)
  const setOpen = useUiStore((state) => state.setHeaderFooterOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <HeaderFooterContent onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

/** Placeholder names in the interface language (both languages work). */
const PLACEHOLDERS =
  locale === 'de' ? ['seite', 'seiten', 'datei', 'datum'] : ['page', 'pages', 'file', 'date']

const SLOTS = [t('links'), t('Mitte'), t('rechts')] as const
type Row = 'header' | 'footer'

function HeaderFooterContent({ onDone }: { onDone: () => void }) {
  const current = useDocumentStore((state) => state.headerFooter)
  const [draft, setDraft] = useState<HeaderFooter>(current ?? DEFAULT_HEADER_FOOTER)
  const update = (change: Partial<HeaderFooter>) => setDraft((value) => ({ ...value, ...change }))
  const setSlot = (row: Row, slot: number, text: string) =>
    setDraft((value) => {
      const slots = [...value[row]] as HeaderFooter[Row]
      slots[slot] = text
      return { ...value, [row]: slots }
    })

  const apply = () => {
    useDocumentStore.getState().setHeaderFooter(hasStamps(draft) ? draft : null)
    onDone()
  }

  const row = (name: Row, title: string) => (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{title}</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {SLOTS.map((slot, index) => (
          <Input
            key={slot}
            value={draft[name][index]}
            maxLength={80}
            placeholder={slot}
            aria-label={`${title} ${slot}`}
            className="h-8 px-2 text-base sm:text-sm"
            onChange={(event) => setSlot(name, index, event.target.value)}
          />
        ))}
      </div>
    </fieldset>
  )

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('Seitenzahlen, Kopf- und Fußzeilen')}</DialogTitle>
        <DialogDescription>
          {t('Erscheinen auf jeder Seite und werden beim Speichern in die PDF geschrieben.')}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-1.5" aria-label={t('Vorlagen')}>
        {HEADER_FOOTER_PRESETS.map((preset) => (
          <Button
            key={preset.name}
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => update({ header: preset.header, footer: preset.footer })}
          >
            {preset.name}
          </Button>
        ))}
      </div>

      {row('header', t('Kopfzeile'))}
      {row('footer', t('Fußzeile'))}
      <p className="text-muted-foreground text-xs">
        {t('Platzhalter:')}{' '}
        {PLACEHOLDERS.map((name, index) => (
          <span key={name}>
            {index > 0 && ', '}
            <code>{`{${name}}`}</code>
          </span>
        ))}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Options
          label={t('Schriftgröße')}
          value={draft.fontSize}
          onChange={(fontSize) => update({ fontSize })}
          options={[
            [8, '8'],
            [9, '9'],
            [10, '10'],
            [12, '12'],
          ]}
        />
        <Options
          label={t('Abstand zum Rand')}
          value={draft.margin}
          onChange={(margin) => update({ margin })}
          options={[
            [14, t('Klein')],
            [24, t('Normal')],
            [40, t('Groß')],
          ]}
        />
        <Options
          label={t('Farbe')}
          value={draft.color}
          onChange={(color) => update({ color })}
          options={[
            ['#475569', t('Grau')],
            ['#000000', t('Schwarz')],
            ['#1d4ed8', t('Blau')],
          ]}
        />
        <label className="space-y-1">
          <span className="block text-sm font-medium">{t('Erste Seitenzahl')}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            value={draft.firstNumber}
            className="h-8 w-24 text-base sm:text-sm"
            onChange={(event) =>
              update({ firstNumber: Math.max(0, Math.round(Number(event.target.value) || 0)) })
            }
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-primary size-4"
          checked={draft.skipFirstPage}
          onChange={(event) => update({ skipFirstPage: event.target.checked })}
        />
        {t('Nicht auf der ersten Seite (Deckblatt)')}
      </label>

      <DialogFooter className="gap-2">
        {current && (
          <Button
            variant="outline"
            className="sm:mr-auto"
            onClick={() => {
              useDocumentStore.getState().setHeaderFooter(null)
              onDone()
            }}
          >
            {t('Entfernen')}
          </Button>
        )}
        <Button variant="outline" onClick={onDone}>
          {t('Abbrechen')}
        </Button>
        <Button onClick={apply}>{t('Übernehmen')}</Button>
      </DialogFooter>
    </DialogContent>
  )
}

function Options<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<readonly [T, string]>
  onChange: (value: T) => void
}) {
  return (
    <div className="space-y-1">
      <span className="block text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map(([option, name]) => (
          <Button
            key={String(option)}
            size="sm"
            role="radio"
            aria-checked={value === option}
            variant={value === option ? 'secondary' : 'outline'}
            className={cn('h-7 px-2 text-xs', value === option && 'ring-ring ring-1')}
            onClick={() => onChange(option)}
          >
            {name}
          </Button>
        ))}
      </div>
    </div>
  )
}
