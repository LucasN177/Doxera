/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const PDFJS = 'node_modules/pdfjs-dist'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from https://<user>.github.io/Doxera/
  base: process.env.GITHUB_PAGES ? '/Doxera/' : '/',
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
        // pdf.js worker, MuPDF and Tesseract assets are large
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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
