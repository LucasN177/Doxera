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
      { keys: ['mod+Z'], label: 'Rückgängig' },
      { keys: ['mod+Y', 'mod+⇧ Z'], label: 'Wiederholen' },
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
    title: 'Seiten (in der Seitenleiste)',
    shortcuts: [
      { keys: ['Klick'], label: 'Seite auswählen und anzeigen' },
      { keys: ['mod+Klick', '⇧ Klick'], label: 'Mehrere Seiten auswählen' },
      { keys: ['mod+A'], label: 'Alle Seiten auswählen' },
      { keys: ['Entf'], label: 'Ausgewählte Seiten löschen' },
      { keys: ['Leertaste'], label: 'Seite zum Verschieben aufnehmen (dann ↑ ↓)' },
    ],
  },
  {
    title: 'Zeichnen & beschriften (im Zeichenmodus)',
    shortcuts: [
      { keys: ['V'], label: 'Auswählen und verschieben' },
      { keys: ['R', 'E'], label: 'Rechteck / Ellipse' },
      { keys: ['L', 'P'], label: 'Linie / Pfeil' },
      { keys: ['D', 'M'], label: 'Stift / Marker (freihand)' },
      { keys: ['T'], label: 'Text' },
      { keys: ['B'], label: 'Vorhandenen Text & Bilder bearbeiten' },
      { keys: ['K'], label: 'Notiz / Kommentar' },
      { keys: ['X'], label: 'Schwärzen (dauerhaft beim Export)' },
      { keys: ['Entf'], label: 'Ausgewähltes Element löschen' },
      { keys: ['Esc'], label: 'Auswahl aufheben, dann Modus beenden' },
    ],
  },
  {
    title: 'Ansicht',
    shortcuts: [
      { keys: ['mod++', 'mod+-'], label: 'Vergrößern / verkleinern' },
      { keys: ['mod+0'], label: 'Seitenbreite' },
      { keys: ['mod+Mausrad'], label: 'Zoomen' },
      { keys: ['F4'], label: 'Seitenleiste ein-/ausblenden' },
      { keys: ['G'], label: 'Seitenübersicht ein-/ausblenden' },
      { keys: ['?'], label: 'Diese Übersicht' },
    ],
  },
]
