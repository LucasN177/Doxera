import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useViewerStore } from '@/stores/viewerStore'
import { PageNavigation } from './PageNavigation'

function setup(currentPage = 3) {
  useViewerStore.setState({ currentPage, navigation: null })
  render(
    <TooltipProvider>
      <PageNavigation pageCount={10} />
    </TooltipProvider>,
  )
  return screen.getByRole('textbox', { name: 'Seitennummer' })
}

describe('PageNavigation', () => {
  it('jumps to the entered page on Enter', () => {
    const input = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.submit(input)
    expect(useViewerStore.getState().navigation?.page).toBe(7)
  })

  it('clamps the entered page to the document range', () => {
    const input = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.submit(input)
    expect(useViewerStore.getState().navigation?.page).toBe(10)
  })

  it('does not treat the navigation buttons as submit buttons', () => {
    setup()
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button')
    }
  })

  it('moves to the next and previous page', () => {
    setup(3)
    fireEvent.click(screen.getByRole('button', { name: 'Nächste Seite' }))
    expect(useViewerStore.getState().navigation?.page).toBe(4)
    fireEvent.click(screen.getByRole('button', { name: 'Vorherige Seite' }))
    expect(useViewerStore.getState().navigation?.page).toBe(3)
  })
})
