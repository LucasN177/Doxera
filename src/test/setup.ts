import '@testing-library/jest-dom/vitest'
import { setUnicodeFontSource } from '@/engine/fonts/unicodeFont'

// jsdom has no service workers: stub the PWA registration hook for all tests.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn(() => ({
    offlineReady: [false, () => {}],
    needRefresh: [false, () => {}],
    updateServiceWorker: async () => {},
  })),
}))

// jsdom lacks matchMedia (used by the toaster for the system color scheme).
// Engine tests that need real WebAssembly run in the node environment without window.
if (typeof window !== 'undefined')
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })

// The Unicode export font is fetched in the app; tests read it from pdf.js' package.
setUnicodeFontSource(async (style) => {
  // Typed by hand: the app's TypeScript setup has no Node types
  const module = 'node:fs/promises'
  const { readFile } = (await import(/* @vite-ignore */ module)) as {
    readFile: (path: string) => Promise<Uint8Array>
  }
  return new Uint8Array(
    await readFile(`node_modules/pdfjs-dist/standard_fonts/LiberationSans-${style}.ttf`),
  )
})
