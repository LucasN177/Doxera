/** Shortcuts shown in the overview dialog. `mod` is Ctrl, or ⌘ on Apple devices. */
export const SHORTCUT_GROUPS: Array<{
  title: string
  shortcuts: Array<{ keys: string[]; label: string }>
}> = [
  {
    title: 'Dokument',
    shortcuts: [
      { keys: ['mod+O'], label: 'PDF öffnen' },
      { keys: ['mod+S'], label: 'Herunterladen / Sichern' },
      { keys: ['mod+F'], label: 'Im Dokument suchen' },
      { keys: ['Enter', 'F3'], label: 'Nächster Treffer' },
      { keys: ['⇧ Enter', '⇧ F3'], label: 'Vorheriger Treffer' },
      { keys: ['Esc'], label: 'Suche oder Dialog schließen' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['→', 'N'], label: 'Nächste Seite' },
      { keys: ['←', 'P'], label: 'Vorherige Seite' },
      { keys: ['Pos1', 'Ende'], label: 'Erste / letzte Seite' },
      { keys: ['Bild ↑', 'Bild ↓'], label: 'Bildschirmweise blättern' },
    ],
  },
  {
    title: 'Ansicht',
    shortcuts: [
      { keys: ['mod++', 'mod+-'], label: 'Vergrößern / verkleinern' },
      { keys: ['mod+0'], label: 'Seitenbreite' },
      { keys: ['mod+Mausrad'], label: 'Zoomen' },
      { keys: ['F4'], label: 'Seitenleiste ein-/ausblenden' },
      { keys: ['?'], label: 'Diese Übersicht' },
    ],
  },
]
