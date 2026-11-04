import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it('shows the empty state with an open button when no document is loaded', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'PDF öffnen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Datei auswählen' })).toBeInTheDocument()
  })
})
