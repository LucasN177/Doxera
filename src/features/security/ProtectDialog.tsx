import { Download, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { validPassword } from '@/engine/mupdf/encryption'
import { documentBytes } from '@/features/document/documentBytes'
import { createPdfFile, saveFile } from '@/lib/download'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'

export function ProtectDialog() {
  const open = useUiStore((state) => state.protectOpen)
  const setOpen = useUiStore((state) => state.setProtectOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <ProtectContent onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

function ProtectContent({ onDone }: { onDone: () => void }) {
  const name = useDocumentStore((state) => state.document?.name ?? 'Dokument.pdf')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [allowPrint, setAllowPrint] = useState(true)
  const [allowCopy, setAllowCopy] = useState(true)
  const [allowEdit, setAllowEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  let problem: string | null = null
  if (password && !validPassword(password)) problem = 'Das Passwort darf kein Komma enthalten.'
  else if (password && password.length < 4) problem = 'Bitte mindestens 4 Zeichen verwenden.'
  else if (repeat && repeat !== password) problem = 'Die Passwörter stimmen nicht überein.'
  const ready = !!password && repeat === password && !problem

  const protect = async () => {
    setBusy(true)
    try {
      const data = await documentBytes()
      const { encryptPdfData } = await import('@/engine/mupdf/client')
      const encrypted = await encryptPdfData(data, {
        userPassword: password,
        allowPrint,
        allowCopy,
        allowEdit,
      })
      // Saving needs a fresh tap on iPhone/iPad (share sheet): offer a button
      setFile(createPdfFile(encrypted, `${name.replace(/\.pdf$/i, '')} (geschützt).pdf`))
    } catch (error) {
      console.error('Verschlüsseln fehlgeschlagen', error)
      toast.error('Die PDF konnte nicht geschützt werden.')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!file) return
    try {
      await saveFile(file)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        toast.error('Die Datei konnte nicht gespeichert werden.')
      }
    }
  }

  const checkbox = (label: string, checked: boolean, onChange: (value: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="accent-primary size-4"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Mit Passwort schützen</DialogTitle>
        <DialogDescription>
          Erstellt eine mit AES-256 verschlüsselte Kopie, die sich nur mit dem Passwort öffnen
          lässt. Doxera speichert das Passwort nicht – gut aufheben!
        </DialogDescription>
      </DialogHeader>

      {file ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-5 text-green-600" aria-hidden />
            {file.name} ist bereit.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={onDone}>
              Schließen
            </Button>
            <Button onClick={() => void save()}>
              <Download /> Speichern
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (ready) void protect()
          }}
        >
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Passwort"
            aria-label="Passwort"
            className="text-base sm:text-sm"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Passwort wiederholen"
            aria-label="Passwort wiederholen"
            className="text-base sm:text-sm"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
          {problem && (
            <p className="text-destructive text-sm" role="alert">
              {problem}
            </p>
          )}
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Erlauben</legend>
            {checkbox('Drucken', allowPrint, setAllowPrint)}
            {checkbox('Text kopieren', allowCopy, setAllowCopy)}
            {checkbox('Ändern, Kommentieren, Formulare', allowEdit, setAllowEdit)}
            <p className="text-muted-foreground text-xs">
              Diese Einschränkungen beachten die meisten PDF-Programme, sie sind aber kein harter
              Schutz – das Passwort zum Öffnen schon.
            </p>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={!ready || busy}>
              {busy ? 'Wird verschlüsselt …' : 'Schützen'}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  )
}
