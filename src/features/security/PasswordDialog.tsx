import { LockKeyhole } from 'lucide-react'
import { useState } from 'react'
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
import { useUiStore, type PasswordRequest } from '@/stores/uiStore'
import { t } from '@/i18n'

/** Asks for the password of a protected PDF while it is being opened. */
export function PasswordDialog() {
  const request = useUiStore((state) => state.passwordRequest)
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && request?.resolve(null)}>
      {request && <PasswordContent key={`${request.name}-${request.retry}`} request={request} />}
    </Dialog>
  )
}

function PasswordContent({ request }: { request: PasswordRequest }) {
  const [password, setPassword] = useState('')
  const submit = () => {
    if (password) request.resolve(password)
  }
  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <LockKeyhole className="size-5" aria-hidden /> {t('Passwortgeschützte PDF')}
        </DialogTitle>
        <DialogDescription>
          {t(
            '„{name}“ ist geschützt. Das Passwort wird nur hier im Browser zum Entsperren verwendet und nicht gespeichert.',
            { name: request.name },
          )}
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Input
          type="password"
          autoFocus
          autoComplete="off"
          value={password}
          aria-label={t('Passwort')}
          aria-invalid={request.retry}
          placeholder={t('Passwort')}
          className="text-base sm:text-sm"
          onChange={(event) => setPassword(event.target.value)}
        />
        {request.retry && (
          <p className="text-destructive text-sm" role="alert">
            {t('Das Passwort ist falsch. Bitte erneut versuchen.')}
          </p>
        )}
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => request.resolve(null)}>
            {t('Abbrechen')}
          </Button>
          <Button type="submit" disabled={!password}>
            {t('Entsperren')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
