import { t } from '@/i18n'
/** Shortcuts shown in the overview dialog. `mod` is Ctrl, or ⌘ on Apple devices. */
export const SHORTCUT_GROUPS: Array<{
  title: string
  shortcuts: Array<{ keys: string[]; label: string }>
}> = [
  {
    title: t('Dokument'),
    shortcuts: [
      { keys: ['mod+O'], label: t('PDF öffnen') },
      { keys: ['mod+S'], label: t('Herunterladen / Sichern') },
      { keys: ['mod+F'], label: t('Im Dokument suchen') },
      { keys: ['mod+Z'], label: t('Rückgängig') },
      { keys: ['mod+Y', t('mod+⇧ Z')], label: t('Wiederholen') },
      { keys: ['Enter', 'F3'], label: t('Nächster Treffer') },
      { keys: [t('⇧ Enter'), '⇧ F3'], label: t('Vorheriger Treffer') },
      { keys: [t('Esc')], label: t('Suche oder Dialog schließen') },
    ],
  },
  {
    title: t('Navigation'),
    shortcuts: [
      { keys: ['→', 'N'], label: t('Nächste Seite') },
      { keys: ['←', 'P'], label: t('Vorherige Seite') },
      { keys: [t('Pos1'), t('Ende')], label: t('Erste / letzte Seite') },
      { keys: [t('Bild ↑'), t('Bild ↓')], label: t('Bildschirmweise blättern') },
    ],
  },
  {
    title: t('Seiten (in der Seitenleiste)'),
    shortcuts: [
      { keys: [t('Klick')], label: t('Seite auswählen und anzeigen') },
      { keys: ['mod+Klick', t('⇧ Klick')], label: t('Mehrere Seiten auswählen') },
      { keys: ['mod+A'], label: t('Alle Seiten auswählen') },
      { keys: [t('Entf')], label: t('Ausgewählte Seiten löschen') },
      { keys: [t('Leertaste')], label: t('Seite zum Verschieben aufnehmen (dann ↑ ↓)') },
    ],
  },
  {
    title: t('Zeichnen & beschriften (im Zeichenmodus)'),
    shortcuts: [
      { keys: ['V'], label: t('Auswählen und verschieben') },
      { keys: ['R', 'E'], label: t('Rechteck / Ellipse') },
      { keys: ['L', 'P'], label: t('Linie / Pfeil') },
      { keys: ['D', 'M'], label: t('Stift / Marker (freihand)') },
      { keys: ['T'], label: t('Text') },
      { keys: ['B'], label: t('Vorhandenen Text & Bilder bearbeiten') },
      { keys: ['K'], label: t('Notiz / Kommentar') },
      { keys: ['X'], label: t('Schwärzen (dauerhaft beim Export)') },
      { keys: [t('Entf')], label: t('Ausgewähltes Element löschen') },
      { keys: [t('Esc')], label: t('Auswahl aufheben, dann Modus beenden') },
    ],
  },
  {
    title: t('Ansicht'),
    shortcuts: [
      { keys: ['mod++', t('mod+-')], label: t('Vergrößern / verkleinern') },
      { keys: ['mod+0'], label: t('Seitenbreite') },
      { keys: ['mod+Mausrad'], label: t('Zoomen') },
      { keys: ['F4'], label: t('Seitenleiste ein-/ausblenden') },
      { keys: ['G'], label: t('Seitenübersicht ein-/ausblenden') },
      { keys: ['?'], label: t('Diese Übersicht') },
    ],
  },
]
