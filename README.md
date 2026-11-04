
# Doxera

**A smarter way to work with documents.**

Doxera is a modern, browser-based PDF editor designed to make working with documents easier, smarter and more efficient.

The goal is to combine powerful PDF editing capabilities with intelligent document processing and AI-powered features – all within a clean and intuitive interface.

Doxera is being developed with a privacy-first approach. Documents should be processed locally in the browser whenever possible, without requiring users to upload sensitive files to external servers.

**▶ Try it:** [lucasn177.github.io/Doxera](https://lucasn177.github.io/Doxera/) – installable as an app (PWA) and usable offline.

> 🚧 **Work in Progress** – Doxera is under active development. Checked items (✅ / `[x]`) are available in the current version; unchecked items are on the roadmap.

---

## ✨ Features & Roadmap

### 📄 PDF Viewing & Editing

Comprehensive tools for viewing and editing existing PDF documents.

- [x] View and navigate PDF documents (zoom, fit to width/page, page navigation)
- [x] Select and copy text
- [x] Full-text search with highlighted matches
- [x] Select and edit existing text (line by line: change, restyle or delete a line; exported in place of the original)
- [x] Add, modify and delete text (new text boxes; existing text line by line)
- [x] Change font size, font family, bold/italic and text color
- [x] Move and resize existing elements (images and edited text lines)
- [x] Select, move, resize and remove existing images (removed image data is dropped from the file)
- [x] Add shapes, lines, arrows and text boxes (select, move, resize, recolor)
- [x] Add images (PNG, JPEG, WebP, HEIC …; move and resize with fixed proportions)
- [x] Highlight, underline and strike through text (from a text selection)
- [x] Add comments and notes (sticky notes with a comment list; exported as standard PDF comments)
- [x] Insert signatures (draw, type or upload; saved locally for reuse)
- [x] Draw freehand with pen and marker (smoothed strokes; move, recolor, delete)
- [x] Add watermarks (text or image, size, opacity, angle; all, selected or current pages)
- [x] Permanently redact sensitive information (areas or selected text; the content below is removed from the exported file)

### 📑 Page Management

Tools for organizing and restructuring PDF documents.

- [x] Merge multiple PDF files (insert pages of other PDFs)
- [x] Split PDF documents (every n pages, at selected pages or into single pages)
- [x] Extract individual pages (save a selection as a new PDF)
- [x] Delete, rotate and rearrange pages
- [x] Crop pages (non-destructive, can be reset any time)
- [x] Duplicate pages
- [x] Preview pages using thumbnails
- [x] Drag-and-drop page organization (mouse, touch and keyboard)
- [x] Page overview grid for organizing pages, also on smartphones
- [x] Undo and redo for all page changes

### 🧠 AI-Powered Document Intelligence

Make documents understandable and turn unstructured information into useful data.

- [ ] AI-powered document summaries
- [ ] Interactive AI chat with PDF documents
- [ ] Ask questions about document contents
- [ ] Context-aware answers with page references
- [ ] Automatic document classification
- [ ] Extract structured information from documents
- [ ] Identify important dates, names and amounts
- [ ] Extract tables and structured data
- [ ] Compare multiple documents
- [ ] Explain complex documents in simple language

### 🔍 OCR & Document Recognition

Extract information from scanned documents and image-based PDFs.

- [x] Optical Character Recognition (OCR), entirely in the browser
- [x] Convert scanned documents into searchable PDFs (invisible text layer: search, select, copy)
- [x] Detect text positions and document structure (blocks, paragraphs, lines, words)
- [x] Recognize headings, paragraphs and lists; export the text as Markdown or plain text (redacted lines are left out)
- [x] Extract tables from scanned and digital documents (CSV for spreadsheets, Markdown tables)
- [x] Support multiple languages (German, English, French, Spanish, Italian – shipped with Doxera)

### ⚙️ Document Processing & Automation

Automate repetitive document-related tasks.

- [ ] Batch processing of multiple PDF files
- [x] Compress PDF documents (images scaled to 150 or 96 dpi for their displayed size, font subsetting, or lossless)
- [x] Convert PDFs to images (PNG or JPEG, 72–300 dpi, with all edits; ZIP or share sheet)
- [x] Convert images to PDFs (A4, Letter or image size; open as new PDF or insert as pages; HEIC supported)
- [x] Export extracted data to CSV, Excel and JSON (text, tables with real numbers, comments)
- [ ] Create reusable processing workflows
- [ ] Automate document classification and extraction
- [ ] Process invoices and extract relevant information
- [ ] Custom document processing templates

### 🔒 Privacy & Local Storage

Privacy and data security are important design principles of Doxera.

- [x] Client-side PDF processing
- [x] Local document storage using IndexedDB ("Recently opened")
- [x] Offline support
- [x] No mandatory user registration
- [x] No automatic document uploads
- [ ] Optional external AI integrations
- [x] Configurable document retention and deletion (turn off remembering, delete single documents or all local data)

### 📱 App Experience

- [x] Installable as an app (PWA) with update notifications
- [x] iPhone & iPad support: save via the share sheet ("Save to Files"), pinch-to-zoom, touch-friendly page organization
- [x] Download and share PDFs
- [x] Keyboard shortcuts with an overview (`?`)
- [x] Light and dark mode (follows the system by default)

---

## 🛠️ Technology Stack

The project is built on a modern TypeScript-based frontend and browser-native document processing.

| Technology | Purpose | Status |
|---|---|---|
| React | User interface | ✅ in use |
| TypeScript | Type-safe application development | ✅ in use |
| Vite | Development and build tooling | ✅ in use |
| Tailwind CSS | Styling | ✅ in use |
| shadcn/ui | UI components | ✅ in use |
| Zustand | State management | ✅ in use |
| PDF.js | PDF rendering, text layer and search | ✅ in use |
| pdf-lib | PDF creation and manipulation (export of edited documents) | ✅ in use |
| dnd-kit | Drag and drop for page organization | ✅ in use |
| fflate | ZIP archives when splitting PDFs | ✅ in use |
| IndexedDB (idb) | Local document storage | ✅ in use |
| Web Workers | Background processing (PDF.js worker) | ✅ in use |
| WebAssembly | High-performance browser processing (PDF.js image decoders) | ✅ in use |
| vite-plugin-pwa / Workbox | Offline support and installation | ✅ in use |
| Vitest & Testing Library | Unit and component tests | ✅ in use |
| MuPDF.js | Advanced PDF processing (redaction, text editing, compression) | ✅ in use (loaded on demand) |
| Tesseract.js | Optical Character Recognition | ✅ in use (loaded on demand) |

Additional AI technologies and integrations will be evaluated during development.

---

## 🏗️ Architecture

Doxera is designed as a client-side application with a modular architecture.

It runs entirely in the browser, without requiring a dedicated backend.

```text
Doxera
│
├── Frontend
│   ├── React
│   ├── TypeScript
│   ├── UI Components
│   └── State Management
│
├── PDF Engine
│   ├── PDF Rendering
│   ├── Text Editing
│   ├── Page Management
│   └── Document Manipulation
│
├── Processing
│   ├── OCR
│   ├── Text Extraction
│   ├── Document Analysis
│   └── Batch Processing
│
├── AI Integration
│   ├── Document Summarization
│   ├── Document Chat
│   ├── Data Extraction
│   └── Document Comparison
│
└── Local Storage
    ├── IndexedDB
    └── Document Metadata
```

Edited documents are represented as a list of page references (source file, page, rotation). Changes are instant and fully undoable; a new PDF is only built with pdf-lib when exporting.

The architecture should remain extensible, allowing optional backend services and cloud integrations in the future. Details: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

---

## 🚀 Deployment

Doxera is hosted as a static web application on **GitHub Pages**.

A GitHub Actions pipeline lints, tests, builds and publishes the application automatically on every push to `main`.

The goal is to provide a freely accessible PDF editor without requiring server infrastructure for its core functionality.

---

## 💻 Development

Requirements: Node.js 24 or newer.

```bash
npm install
npm run dev        # start the development server
npm test           # run the tests
npm run lint       # lint with oxlint
npm run build      # production build
```

---

## 🎯 Project Goals

Doxera is a personal development project focused on exploring modern web technologies and advanced document processing.

The main objectives are:

- Build a fully functional PDF editor with advanced editing capabilities.
- Explore PDF document structures and browser-based processing.
- Integrate AI into practical document workflows.
- Develop a privacy-focused application without mandatory cloud infrastructure.
- Create a modular and maintainable software architecture.
- Gain practical experience with React, TypeScript and WebAssembly.

---

## 📌 Project Status

**Version 0.1.0** – Doxera is under active development.

- ✅ **Phase 1 – Viewer:** viewing, search, local library, export, offline support, dark mode, iPhone/iPad support
- ✅ **Phase 2 – Page management:** rotate, delete, duplicate, reorder, merge, extract, split and crop pages, with a page overview that also works on smartphones
- ✅ **Phase 3 – Annotations:** shapes, lines, arrows, text boxes, freehand drawing, text highlighting, comments, images, signatures and watermarks – all exported into the PDF
- ✅ **Phase 4 – Real editing:** permanent redaction, editing existing text and moving, resizing or removing existing images with MuPDF.js
- ✅ **Phase 5 – OCR:** scanned pages become searchable PDFs; text export with headings, paragraphs, lists and tables (Markdown, text, CSV)
- 🚧 **Phase 6 – Processing:** converting, compression and data export (Excel, JSON, CSV) are done; batch processing and workflows are next
- 🔜 **Next phase:** AI features

The full roadmap is in the [implementation plan](docs/IMPLEMENTATION_PLAN.md).

## 📄 License

Doxera is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-or-later), as it uses [MuPDF.js](https://mupdf.readthedocs.io/).

**Built with curiosity and a passion for software development.**
