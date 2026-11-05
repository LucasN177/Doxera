/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const PDFJS = 'node_modules/pdfjs-dist'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }
const { version: tesseractVersion } = JSON.parse(
  readFileSync(new URL('./node_modules/tesseract.js/package.json', import.meta.url), 'utf8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from https://<user>.github.io/Doxera/
  base: process.env.GITHUB_PAGES ? '/Doxera/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    tailwindcss(),
    // pdf.js loads CMaps, standard fonts and WASM decoders at runtime from /pdfjs/
    viteStaticCopy({
      targets: ['cmaps', 'standard_fonts', 'wasm', 'iccs'].map((dir) => ({
        src: `${PDFJS}/${dir}`,
        dest: 'pdfjs',
        rename: { stripBase: 2 }, // drop node_modules/pdfjs-dist/
      })),
    }),
    // OCR: Tesseract worker, WebAssembly cores (LSTM only) and recognition data,
    // served by Doxera itself so nothing is fetched from a CDN
    viteStaticCopy({
      targets: [
        { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: 'tesseract' },
        { src: 'node_modules/tesseract.js-core/tesseract-core*-lstm.wasm.js', dest: 'tesseract' },
        {
          src: 'node_modules/@tesseract.js-data/*/4.0.0_best_int/*.traineddata.gz',
          dest: 'tesseract/lang',
        },
      ].map((target) => ({ ...target, rename: { stripBase: true as const } })),
    }),
    VitePWA({
      // Users are asked before a new version is activated (see ReloadPrompt)
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: './',
        name: 'Doxera',
        short_name: 'Doxera',
        description:
          'A smarter way to work with documents – privacy-first PDF editor in your browser.',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        categories: ['productivity', 'utilities'],
        // Installed app: offered for PDFs and pictures in "Open with" (Chromium desktop)
        file_handlers: [
          {
            action: './',
            accept: {
              'application/pdf': ['.pdf'],
              'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'],
            },
          },
        ],
        // A file opened while Doxera runs goes to the open window instead of a new one
        launch_handler: { client_mode: 'focus-existing' },
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole app shell incl. future workers/WASM for full offline use
        globPatterns: [
          '**/*.{js,mjs,css,html,ico,png,svg,webp,woff2,wasm}',
          // pdf.js runtime resources, needed to render all PDFs offline
          'pdfjs/**/*.{bcmap,pfb,ttf,icc}',
        ],
        // MuPDF (~10 MB) is only needed for redaction & editing: cached on first use
        // (see runtimeCaching), so it doesn't slow down the first visit
        // The same goes for OCR (Tesseract ~4 MB plus 1–3 MB per language)
        globIgnores: ['**/mupdf-wasm-*.wasm', 'tesseract/**'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/mupdf-wasm-[\w-]+\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'doxera-mupdf', expiration: { maxEntries: 2 } },
          },
          {
            // File names carry no hash: a new Tesseract version gets a new cache
            urlPattern: /\/tesseract\//,
            handler: 'CacheFirst',
            options: {
              cacheName: `doxera-tesseract-${tesseractVersion}`,
              expiration: { maxEntries: 12 },
            },
          },
        ],
        // pdf.js worker and Tesseract assets are large
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
      devOptions: {
        // Set to true to test the service worker with `npm run dev`
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // MuPDF loads its .wasm relative to its own module: don't pre-bundle it
    exclude: ['mupdf'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
