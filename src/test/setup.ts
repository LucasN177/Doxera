import '@testing-library/jest-dom/vitest'

// jsdom has no service workers: stub the PWA registration hook for all tests.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn(() => ({
    offlineReady: [false, () => {}],
    needRefresh: [false, () => {}],
    updateServiceWorker: async () => {},
  })),
}))
