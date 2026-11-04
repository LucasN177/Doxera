import '@testing-library/jest-dom/vitest'

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
