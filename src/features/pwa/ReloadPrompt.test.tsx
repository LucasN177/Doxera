import { fireEvent, render, screen } from '@testing-library/react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { ReloadPrompt } from './ReloadPrompt'

function mockSW(state: { offlineReady?: boolean; needRefresh?: boolean }) {
  const updateServiceWorker = vi.fn()
  vi.mocked(useRegisterSW).mockReturnValue({
    offlineReady: [state.offlineReady ?? false, vi.fn()],
    needRefresh: [state.needRefresh ?? false, vi.fn()],
    updateServiceWorker,
  })
  return updateServiceWorker
}

describe('ReloadPrompt', () => {
  it('renders nothing when there is no update', () => {
    mockSW({})
    const { container } = render(<ReloadPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows offline-ready notice without update button', () => {
    mockSW({ offlineReady: true })
    render(<ReloadPrompt />)
    expect(screen.getByText(/offline verfügbar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aktualisieren' })).not.toBeInTheDocument()
  })

  it('activates the new service worker on update', () => {
    const update = mockSW({ needRefresh: true })
    render(<ReloadPrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }))
    expect(update).toHaveBeenCalledWith(true)
  })
})
