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
| **Offline-fähig**     | PWA mit Service Worker, sobald die Kernfunktionen stehen.                                                                                                   |

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

### Phase 0 – Projekt-Setup ✅ (dieser Schritt)

- Vite + React + TypeScript, Tailwind v4, shadcn/ui-Konfiguration, Pfad-Alias `@/`
- oxlint, Prettier, Vitest + Testing Library
- Ordnerstruktur gemäß Architektur
- GitHub-Actions-Workflow für CI und Deployment auf GitHub Pages

### Phase 1 – Viewer & Grundgerüst (MVP)

- App-Layout: Toolbar, Seiten-Sidebar, Arbeitsfläche, Eigenschaften-Panel
- Datei öffnen per Dialog und Drag & Drop
- PDF.js in Web Worker, Seiten-Rendering mit Virtualisierung, Zoom, Navigation
- Text-Layer (Auswahl, Suche)
- Thumbnails in der Sidebar
- IndexedDB: zuletzt geöffnete Dokumente lokal speichern/löschen
- Download/Export des Dokuments
- **Ergebnis:** benutzbarer, lokaler PDF-Viewer auf GitHub Pages

### Phase 2 – Seitenverwaltung

- Löschen, Drehen, Duplizieren, Umsortieren (Drag & Drop) von Seiten
- Merge mehrerer PDFs, Split, Seiten extrahieren
- Seiten zuschneiden (CropBox)
- Undo/Redo über das Operationsmodell

### Phase 3 – Annotationen & Ergänzungen

- Hervorheben, Freitext, Kommentare/Notizen
- Bilder und Formen einfügen, verschieben, skalieren
- Signaturen (zeichnen, tippen, Bild) mit lokaler Speicherung
- Wasserzeichen (Text/Bild)

### Phase 4 – Echtes Editieren (MuPDF.js)

- MuPDF.js als WASM in Worker integrieren
- Vorhandenen Text auswählen und bearbeiten (Inhalt, Schriftgröße, Schriftart, Farbe)
- Vorhandene Elemente/Bilder auswählen, verschieben, skalieren, entfernen
- Dauerhafte Schwärzung (Redaction) inkl. Entfernung des darunterliegenden Inhalts
- **Risiko:** komplexester Teil – Schriften-Subsets, Content-Streams. Prototyp früh starten.

### Phase 5 – OCR

- Tesseract.js im Worker, Sprachdaten lazy laden
- Erkennung mit Textpositionen, Überschriften/Absätze
- Unsichtbaren Text-Layer einfügen → durchsuchbares PDF
- Tabellenerkennung aus Scans (zunächst heuristisch)
- Mehrsprachigkeit

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

- PWA (vite-plugin-pwa), vollständige Offline-Nutzung
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

1. Lizenz des Projekts (Kompatibilität mit AGPL von MuPDF.js)
2. Routing-Bedarf (Single-View-Editor vs. mehrere Seiten → React Router mit HashRouter)
3. Welche KI-Provider standardmäßig unterstützt werden (Claude, OpenAI, lokal)
4. Text-Editing-Strategie: MuPDF.js allein oder eigenes Overlay-Modell + MuPDF für den Export
