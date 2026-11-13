import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { memo, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n'
import { unlockRepo } from '@/services/repo'
import { MODAL_REPO_UNLOCK_ID } from '@/constants/modals'

export interface RepoUnlockModalProps {
  /** Absolute path of the repository the owner is opening. */
  path: string
  /** Folder name, shown so the owner knows which repository this is. */
  folderName: string
}

/** NiceModal mounts the component before it is shown, so props can be absent. */
type RepoUnlockModalInput = Partial<RepoUnlockModalProps>

const isBadPassword = (error: unknown): boolean =>
  String(error).toLowerCase().includes('bad_password')

/**
 * Password prompt for an encrypted repository.
 *
 * The wrong-password message appears under the field instead of in a second dialog: retrying
 * is the normal case and a separate window for it only adds a click.
 */
export const RepoUnlockModal = memo((props: RepoUnlockModalInput) => {
  const { path = '', folderName = '' } = props
  const modal = useModal()
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const settledRef = useRef(false)
  const [open, setOpen] = useState(modal.visible)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!modal.visible) return
    settledRef.current = false
    setPassword('')
    setError(null)
    setBusy(false)
    setOpen(true)
  }, [modal.visible])

  const settle = (unlocked: boolean) => {
    if (settledRef.current) return
    settledRef.current = true
    modal.resolve(unlocked)
    void modal.hide()
    modal.remove()
  }

  const submit = async () => {
    if (busy || password.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await unlockRepo(path, password)
      setOpen(false)
      settle(true)
    } catch (problem) {
      setBusy(false)
      setError(
        isBadPassword(problem)
          ? t('repo.unlock.wrong_password')
          : t('repo.unlock.failed', { message: String(problem) }),
      )
      setPassword('')
      inputRef.current?.focus()
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) settle(false)
      }}
    >
      <Dialog.Content
        aria-describedby={undefined}
        closeLabel={t('common.close')}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <Dialog.Header>
          <Dialog.Title>{t('repo.unlock.title')}</Dialog.Title>
        </Dialog.Header>

        <Dialog.Body className='flex flex-col gap-2'>
          <p className='m-0 text-ui-caption text-content-secondary'>{folderName}</p>
          <p className='m-0 text-ui-control text-content-secondary'>
            {t('repo.unlock.description')}
          </p>
          <Input
            aria-invalid={error ? true : undefined}
            aria-label={t('repo.unlock.placeholder')}
            autoComplete='off'
            className='w-full'
            ref={inputRef}
            inputSize='sm'
            onChange={(event) => {
              setPassword(event.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
            placeholder={t('repo.unlock.placeholder')}
            type='password'
            value={password}
          />
          {error ? (
            <p className='m-0 text-ui-caption text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </Dialog.Body>

        <Dialog.Footer>
          <Button onClick={() => settle(false)} variant='outline'>
            {t('common.cancel')}
          </Button>
          <Button disabled={busy || password.length === 0} onClick={() => void submit()}>
            {t('common.confirm')}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  )
})

export { MODAL_REPO_UNLOCK_ID }

export const RepoUnlock = NiceModal.create(RepoUnlockModal) as unknown as React.FC<
  RepoUnlockModalInput & { id: string }
>

