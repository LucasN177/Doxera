# Doxera – Implementierungsplan

Abgeleitet aus der [README](../README.md). Doxera ist ein browserbasierter, privacy-first PDF-Editor:
alle Kernfunktionen laufen clientseitig, Hosting als statische Seite auf GitHub Pages, KI-Features optional.

---

## 1. Leitprinzipien

| Prinzip               | Konsequenz für die Umsetzung                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Privacy first**     | Keine Uploads. PDFs werden nur im Browser verarbeitet; Persistenz ausschließlich in IndexedDB. Externe KI nur nach explizitem Opt-in (eigener API-Key).     |
| **Kein Backend (v1)** | Reine SPA, statisch deploybar. Alle Abhängigkeiten (WASM, Worker, OCR-Sprachdaten) werden mit ausgeliefert oder lazy nachgeladen.                           |
| **Modular**           | Klare Trennung von UI, PDF-Engine, Processing, AI und Storage über Interfaces. Spätere Backend-/Cloud-Erweiterungen dürfen die Module nicht umbauen müssen. |
| **Performance**       | Rechenintensive Arbeit (Rendering, OCR, MuPDF, Batch) in Web Workers. Schwere Bibliotheken per Code-Splitting / dynamic `import()`.                         |
| **Offline-fähig**     | PWA mit Service Worker (Grundgerüst seit Phase 0), Offline-Nutzung wird mit jeder Phase erweitert.                                                          |

---

## 2. Technologie-Stack

| Bereich                 | Technologie                                 | Rolle                                                                  |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| UI                      | React 19 + TypeScript                       | Komponenten, Typsicherheit                                             |
| Build                   | Vite                                        | Dev-Server, Bundling, Worker-/WASM-Support                             |
| Styling                 | Tailwind CSS v4 + shadcn/ui                 | Design-System, zugängliche Basiskomponenten                            |
| State                   | Zustand                                     | Leichtgewichtiger globaler State (Dokumente, Editor, UI)               |
| Rendering               | PDF.js (`pdfjs-dist`)                       | Seiten-Rendering, Text-Layer, Textextraktion                           |
| Manipulation            | pdf-lib                                     | Seiten-Operationen, Annotationen, Signaturen, Wasserzeichen, Speichern |
| Erweiterte Verarbeitung | MuPDF.js (WASM)                             | Echtes Text-Editing, Redaction, Komprimierung, PDF→Bild                |
| OCR                     | Tesseract.js                                | Texterkennung, durchsuchbare PDFs                                      |
| Storage                 | IndexedDB (via `idb`)                       | Dokumente, Metadaten, Einstellungen                                    |
| Background              | Web Workers (via Comlink)                   | Off-main-thread-Verarbeitung                                           |
| Tests                   | Vitest + Testing Library, später Playwright | Unit/Component/E2E                                                     |
| Qualität                | oxlint, Prettier                            | Linting, Formatierung                                                  |
| CI/CD                   | GitHub Actions → GitHub Pages               | Build, Test, Deploy                                                    |

> Hinweis zu MuPDF.js: AGPL-lizenziert. Für ein öffentliches Open-Source-Projekt unproblematisch, sollte aber bei der Lizenzwahl des Repos berücksichtigt werden.

---

## 3. Architektur & Ordnerstruktur

```text
src/
├── app/                 # App-Shell, Routing, Provider, Layout
├── components/
│   ├── ui/              # shadcn/ui-Komponenten (generiert)
│   └── layout/          # Toolbar, Sidebar, Panels
├── features/            # Feature-Module (UI + Logik je Feature)
│   ├── viewer/          # Anzeige & Navigation
│   ├── editor/          # Text-/Bild-/Element-Bearbeitung
│   ├── annotations/     # Markieren, Kommentare, Signaturen
│   ├── pages/           # Seitenverwaltung, Thumbnails, Merge/Split
│   ├── ocr/             # OCR-Oberfläche
│   ├── ai/              # Zusammenfassung, Chat, Extraktion
│   ├── automation/      # Batch, Workflows, Templates
│   └── settings/        # Einstellungen, Datenschutz, API-Keys
├── engine/              # PDF-Engine (framework-unabhängig)
│   ├── render/          # PDF.js-Wrapper
│   ├── document/        # Dokumentmodell, pdf-lib-Operationen
│   └── mupdf/           # MuPDF.js-Wrapper
├── processing/          # OCR, Textextraktion, Analyse, Batch
├── ai/                  # Provider-Abstraktion für KI-Integrationen
├── storage/             # IndexedDB-Zugriff, Repositories
├── workers/             # Web-Worker-Entry-Points
├── stores/              # Zustand-Stores
├── lib/                 # Hilfsfunktionen (cn, Dateien, Formatierung)
└── types/               # Gemeinsame Typen
```

**Schichtregeln:** `features` → `engine`/`processing`/`ai`/`storage` → `lib`/`types`.
`engine`, `processing`, `ai` und `storage` importieren kein React, damit sie in Workern und Tests isoliert laufen.

### Zentrales Dokumentmodell

Ein `DoxeraDocument` hält die Original-Bytes, Metadaten und eine Liste von **Änderungsoperationen**
(Seiten drehen/verschieben/löschen, Annotationen, Textänderungen …). Beim Export werden die Operationen
mit pdf-lib bzw. MuPDF auf die Originaldatei angewendet. Vorteile: Undo/Redo, verlustfreie Persistenz, nachvollziehbare Änderungen.

---

## 4. Phasen

### Phase 0 – Projekt-Setup ✅

- Vite + React + TypeScript, Tailwind v4, shadcn/ui-Konfiguration, Pfad-Alias `@/`
- oxlint, Prettier, Vitest + Testing Library
- Ordnerstruktur gemäß Architektur
- GitHub-Actions-Workflow für CI und Deployment auf GitHub Pages
- PWA-Grundgerüst: vite-plugin-pwa (Manifest, Service Worker, Precaching, Update-Hinweis), App-Icons

### Phase 1 – Viewer & Grundgerüst (MVP) ✅

- App-Layout: Toolbar, Seiten-Sidebar, Arbeitsfläche, Eigenschaften-Panel
- Datei öffnen per Dialog und Drag & Drop
- PDF.js in Web Worker, Seiten-Rendering mit Virtualisierung, Zoom, Navigation
- Text-Layer (Auswahl, Suche)
- Thumbnails in der Sidebar
- IndexedDB: zuletzt geöffnete Dokumente lokal speichern/löschen
- Download/Export des Dokuments
- **Ergebnis:** benutzbarer, lokaler PDF-Viewer auf GitHub Pages

**Milestones Phase 1:**

| #   | Milestone                | Inhalt                                                                                                   | Status |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------- | ------ |
| M1  | App-Shell & Datei öffnen | Layout (Toolbar, Sidebar, Arbeitsfläche), Leerzustand, Datei-Dialog, Drag & Drop, Dokument-Store, Fehler | ✅     |
| M2  | Seitenanzeige            | pdf.js im Worker, virtualisiertes Rendering (nur sichtbare Seiten), HiDPI, Zoom/Fit-Modi, Navigation     | ✅     |
| M3  | Thumbnail-Sidebar        | Lazy gerenderte Vorschauen, aktive Seite hervorheben, Klick springt zur Seite                            | ✅     |
| M4  | Text-Layer & Suche       | Text markieren/kopieren, Volltextsuche mit Treffer-Navigation und Hervorhebung                           | ✅     |
| M5  | Lokale Bibliothek        | IndexedDB-Speicherung, „Zuletzt geöffnet“ im Leerzustand, Dokumente lokal löschen                        | ✅     |
| M6  | Export & Feinschliff     | Download, Tastaturkürzel, Dark Mode, Lade-/Fehlerzustände, Performance mit großen PDFs                   | ✅     |

### Phase 2 – Seitenverwaltung ✅

- Löschen, Drehen, Duplizieren, Umsortieren (Drag & Drop) von Seiten
- Merge mehrerer PDFs, Split, Seiten extrahieren
- Seiten zuschneiden (CropBox)
- Undo/Redo über das Operationsmodell

**Seitenmodell:** Das Dokument ist eine Liste virtueller Seiten (`PageRef`: Quelle, Seitenindex,
zusätzliche Drehung). Quellen sind die geöffnete PDF und alle eingefügten PDFs. Bearbeitungen ändern nur
diese Liste – sofort, ohne Neuberechnung der PDF. Erst beim Export baut pdf-lib daraus eine neue Datei.
Undo/Redo speichert Schnappschüsse der Liste.

**Milestones Phase 2:**

| #   | Milestone            | Inhalt                                                                              | Status |
| --- | -------------------- | ----------------------------------------------------------------------------------- | ------ |
| P1  | Seitenmodell & Undo  | Virtuelle Seitenliste, Seiten-Operationen, Undo/Redo, Export mit pdf-lib (auch iOS) | ✅     |
| P2  | Seiten bearbeiten    | Auswahl in der Seitenleiste, Drehen, Duplizieren, Löschen, Tastenkürzel             | ✅     |
| P3  | Umsortieren          | Drag & Drop in der Seitenleiste (Maus, Touch, Tastatur), auch mehrere Seiten        | ✅     |
| P4  | Zusammenführen       | PDFs einfügen, Auswahl als neue PDF exportieren (Extrahieren)                       | ✅     |
| P5  | Teilen & Zuschneiden | PDF aufteilen (alle N Seiten / an Auswahl), Seiten zuschneiden                      | ✅     |
| P6  | Seitenübersicht      | Rasteransicht aller Seiten zum Organisieren, auch auf dem Smartphone                | ✅     |

### Phase 3 – Annotationen & Ergänzungen ✅

- Hervorheben, Freitext, Kommentare/Notizen
- Bilder und Formen einfügen, verschieben, skalieren
- Signaturen (zeichnen, tippen, Bild) mit lokaler Speicherung
- Wasserzeichen (Text/Bild)

**Annotationsmodell:** Annotationen hängen an der Seite (`PageRef.annotations`) und werden damit
automatisch mitkopiert, mitgelöscht, mitgedreht und sind über Undo/Redo abgedeckt. Koordinaten liegen
als Anteile der ungedrehten Seite vor (wie der Zuschnitt). Beim Export zeichnet pdf-lib sie fest in den
Seiteninhalt ein, sodass sie in jedem PDF-Programm gleich aussehen.

**Milestones Phase 3:**

| #   | Milestone                | Inhalt                                                                                  | Status |
| --- | ------------------------ | --------------------------------------------------------------------------------------- | ------ |
| A1  | Formen & Text            | Rechteck, Ellipse, Linie, Pfeil, Textfeld; auswählen, verschieben, Größe, Farbe, Export | ✅     |
| A2  | Text markieren           | Hervorheben, Unterstreichen, Durchstreichen auf Basis der Textauswahl                   | ✅     |
| A3  | Kommentare & Notizen     | Notizzettel mit Text, Liste aller Kommentare                                            | ✅     |
| A4  | Bilder & Signaturen      | Bilder einfügen; Signatur zeichnen, tippen oder laden, lokal speichern                  | ✅     |
| A5  | Freihand & Wasserzeichen | Freihandzeichnen; Text-/Bild-Wasserzeichen für alle Seiten                              | ✅     |

### Phase 4 – Echtes Editieren (MuPDF.js) ✅

- MuPDF.js als WASM in Worker integrieren
- Vorhandenen Text auswählen und bearbeiten (Inhalt, Schriftgröße, Schriftart, Farbe)
- Vorhandene Elemente/Bilder auswählen, verschieben, skalieren, entfernen
- Dauerhafte Schwärzung (Redaction) inkl. Entfernung des darunterliegenden Inhalts
- **Risiko:** komplexester Teil – Schriften-Subsets, Content-Streams. Prototyp früh starten.

**Umsetzung:** MuPDF.js läuft in einem eigenen Web Worker (Comlink) und wird erst bei Bedarf geladen;
die WASM-Datei (~10 MB) wird nicht vorab gecacht, sondern bei der ersten Nutzung (danach offline).
Schwärzungen sind Annotationen (`type: 'redact'`); pdf-lib schreibt sie als /Redact-Annotationen,
MuPDF wendet sie danach an (Text entfernen, Bildpixel löschen, vollständig überdeckte Vektorgrafik
entfernen) und schreibt die Datei vollständig neu (`garbage=compact`), damit nichts Entferntes übrig bleibt.

**Text bearbeiten (E3):** MuPDF liest die Textzeilen einer Seite (Position, Schrift, Größe, Farbe) im
Worker. Eine bearbeitete Zeile wird zur Text-Annotation mit `replaces` (Bereich der Originalzeile).
Export in zwei Stufen: zuerst entfernt MuPDF nur die Glyphen der ersetzten Zeilen (ohne schwarze
Kästen), danach zeichnet pdf-lib den neuen Text mit der passenden Standardschrift (Helvetica, Times,
Courier, jeweils fett/kursiv) an der Originalposition. Grenzen: zeilenweise, nur waagerechter Text,
eingebettete Schriften werden durch die ähnlichste Standardschrift ersetzt, Zeichen außerhalb von
WinAnsi werden zu „?“.

**Bilder bearbeiten (E4):** MuPDF liefert die Bilder einer Seite (Box, Transformation, Pixel); über die
Reihenfolge der `/Name Do`-Aufrufe im Content-Stream wird das zugehörige Bild-XObject bestimmt. Ein
angeklicktes Bild wird zur Bild-Annotation mit `xobject` (Original) und lässt sich verschieben,
skalieren oder entfernen (`removed`). Beim Export zeigt der Seitenname in einer seitenlokalen Kopie der
Ressourcen auf ein leeres Form-XObject; anschließend schreibt MuPDF die Datei ohne unreferenzierte
Objekte neu, sodass die Daten entfernter Bilder nicht in der Datei bleiben. Mit Textänderungen auf
derselben Seite geschieht das schon in der ersten Exportstufe, weil MuPDF Ressourcen umbenennen kann.
Grenzen: nur Bilder, die die Seite direkt und genau einmal zeichnet (keine Inline-Bilder, keine Bilder
in Form-XObjects), nur in Vierteldrehungen (nicht geschert oder gespiegelt).

**Milestones Phase 4:**

| #   | Milestone           | Inhalt                                                                                   | Status |
| --- | ------------------- | ---------------------------------------------------------------------------------------- | ------ |
| E1  | MuPDF-Grundlage     | MuPDF.js lazy im Worker, Nachbearbeitung beim Export, PWA-Caching                        | ✅     |
| E2  | Schwärzen           | Bereiche aufziehen oder Text markieren; beim Export dauerhaft entfernt                   | ✅     |
| E3  | Text bearbeiten     | Vorhandenen Text auswählen, Inhalt/Größe/Farbe ändern (alter Text entfernt, neu gesetzt) | ✅     |
| E4  | Elemente bearbeiten | Vorhandene Bilder auswählen, verschieben, skalieren, entfernen                           | ✅     |

### Phase 5 – OCR

- Tesseract.js im Worker, Sprachdaten lazy laden
- Erkennung mit Textpositionen, Überschriften/Absätze
- Unsichtbaren Text-Layer einfügen → durchsuchbares PDF
- Tabellenerkennung aus Scans (zunächst heuristisch)
- Mehrsprachigkeit

**Umsetzung:** Tesseract.js (Worker, WebAssembly-Kern nur LSTM) und die Erkennungsdaten (`best_int`:
Deutsch, Englisch, Französisch, Spanisch, Italienisch) liefert Doxera selbst unter `/tesseract/` aus –
kein CDN. Sie werden erst bei der ersten Erkennung geladen und dann vom Service Worker gecacht. Seiten
werden mit 300 dpi gerendert (innerhalb der Canvas-Grenze für iOS). Das Ergebnis (Blöcke, Absätze,
Zeilen mit Grundlinie, Wörter) wird als unsichtbare Textebene (Render-Modus 3, jedes Wort auf
Scanbreite gestreckt) in eine neue Quelldatei geschrieben, auf die die Seiten dann zeigen (ein
Undo-Schritt). Suche, Markieren, Kopieren, Text-Bearbeitung und Export funktionieren damit ohne
Sonderfälle. Grenze: Zeichen außerhalb von WinAnsi (Standardschrift Helvetica) werden zu „?“.

**Milestones Phase 5:**

| #   | Milestone       | Inhalt                                                                        | Status |
| --- | --------------- | ----------------------------------------------------------------------------- | ------ |
| O1  | Texterkennung   | Seiten erkennen (Sprachen wählbar), unsichtbare Textebene → durchsuchbare PDF | ✅     |
| O2  | Struktur & Text | Überschriften/Absätze erkennen, erkannten Text als Text/Markdown exportieren  | offen  |
| O3  | Tabellen        | Tabellen aus Scans heuristisch erkennen, als CSV exportieren                  | offen  |

### Phase 6 – Verarbeitung & Automatisierung

- PDF komprimieren, PDF → Bilder, Bilder → PDF
- Batch-Verarbeitung mehrerer Dateien (Queue im Worker)
- Export extrahierter Daten als CSV, JSON, Excel (SheetJS o. ä.)
- Wiederverwendbare Workflows/Templates (Schrittketten, in IndexedDB gespeichert)

### Phase 7 – KI-Funktionen

- Provider-Abstraktion (`AiProvider`-Interface): externe APIs mit eigenem API-Key (Opt-in, Key nur lokal gespeichert), optional lokale Modelle (WebLLM / transformers.js)
- Textextraktion + Chunking mit Seitenreferenzen
- Zusammenfassung, Chat mit Dokument, Antworten mit Seitenverweisen
- Klassifikation, strukturierte Extraktion (Daten, Namen, Beträge, Rechnungen), Tabellen
- Dokumentvergleich, „In einfacher Sprache erklären“
- Deutliche UI-Hinweise, wann Daten das Gerät verlassen

### Phase 8 – Privacy, Offline & Feinschliff

- PWA vervollständigen: Offline-Test aller Features, PDF-Dateizuordnung („Öffnen mit“) via `file_handlers` + Launch Queue API
- Konfigurierbare Aufbewahrung/Löschung lokaler Dokumente
- Barrierefreiheit, Tastaturkürzel, Dark Mode, i18n (DE/EN)
- E2E-Tests mit Playwright, Performance-Optimierung großer PDFs

---

## 5. Querschnittsthemen

- **Tests:** Engine-/Processing-Logik mit Vitest unit-testen (Fixture-PDFs unter `tests/fixtures`). UI-Flows später per Playwright.
- **Fehlerbehandlung:** beschädigte/verschlüsselte PDFs erkennen und verständlich melden.
- **Bundle-Größe:** MuPDF, Tesseract und KI-Bibliotheken ausschließlich lazy laden.
- **GitHub Pages:** `base` in Vite auf `/Doxera/` gesetzt; Hash-basiertes Routing oder 404-Fallback für SPA-Routen.
- **Sicherheit:** Content Security Policy, keine Telemetrie, API-Keys nie im Repo.

## 6. Offene Entscheidungen

1. ~~Lizenz des Projekts~~ → entschieden: AGPL-3.0-or-later (wegen MuPDF.js)
2. Routing-Bedarf (Single-View-Editor vs. mehrere Seiten → React Router mit HashRouter)
3. Welche KI-Provider standardmäßig unterstützt werden (Claude, OpenAI, lokal)
4. Text-Editing-Strategie: MuPDF.js allein oder eigenes Overlay-Modell + MuPDF für den Export
