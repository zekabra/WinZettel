import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { open } from '@tauri-apps/plugin-dialog'
import { memo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n'
import { createRepo } from '@/services/repo'
import { MODAL_REPO_CREATE_ID } from '@/constants/modals'

/** What the wizard returns: the new repository root, or null when cancelled. */
export interface RepoCreateResult {
  path: string
}

type CipherChoice = 'auto' | 'aes' | 'xchacha'
type StrengthChoice = 14 | 16 | 18

const CIPHERS: CipherChoice[] = ['auto', 'aes', 'xchacha']
const STRENGTHS: StrengthChoice[] = [14, 16, 18]

/**
 * "New repository" wizard: the same three options the Android app offers, so a repository
 * created here can be opened on the phone.
 */
export const RepoCreateModal = memo(() => {
  const modal = useModal()
  const { t } = useTranslation()
  const [openState, setOpenState] = useState(modal.visible)
  const [folder, setFolder] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [plaintextNames, setPlaintextNames] = useState(false)
  const [cipher, setCipher] = useState<CipherChoice>('auto')
  const [strength, setStrength] = useState<StrengthChoice>(16)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const settle = (result: RepoCreateResult | null) => {
    modal.resolve(result)
    void modal.hide()
    modal.remove()
  }

  const pickFolder = async () => {
    const picked = await open({ directory: true, multiple: false })
    if (typeof picked === 'string') {
      setFolder(picked)
      setError(null)
    }
  }

  const submit = async () => {
    if (busy) return
    if (!folder) {
      setError(t('repo.create.folder_required'))
      return
    }
    if (password.length < 4) {
      setError(t('repo.create.password_too_short'))
      return
    }
    if (password !== confirmation) {
      setError(t('repo.create.password_mismatch'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      await createRepo({ path: folder, password, plaintextNames, cipher, logN: strength })
      setOpenState(false)
      settle({ path: folder })
    } catch (problem) {
      setBusy(false)
      setError(t('repo.create.failed', { message: String(problem) }))
    }
  }

  return (
    <Dialog.Root
      open={openState}
      onOpenChange={(next) => {
        if (!next) settle(null)
      }}
    >
      <Dialog.Content aria-describedby={undefined} closeLabel={t('common.close')}>
        <Dialog.Header>
          <Dialog.Title>{t('repo.create.title')}</Dialog.Title>
        </Dialog.Header>

        <Dialog.Body className='flex flex-col gap-3'>
          <p className='m-0 text-ui-caption text-content-secondary'>
            {t('repo.create.description')}
          </p>

          <div className='flex flex-col gap-1'>
            <span className='text-ui-caption text-content-secondary'>
              {t('repo.create.folder')}
            </span>
            <div className='flex min-w-0 items-center gap-2'>
              <Input
                aria-label={t('repo.create.folder')}
                className='min-w-0 flex-1'
                inputSize='sm'
                placeholder={t('repo.create.folder_placeholder')}
                readOnly
                value={folder}
              />
              <Button onClick={() => void pickFolder()} size='sm' variant='outline'>
                {t('repo.create.choose_folder')}
              </Button>
            </div>
          </div>

          <Input
            aria-label={t('repo.create.password')}
            className='w-full'
            inputSize='sm'
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('repo.create.password')}
            type='password'
            value={password}
          />
          <Input
            aria-label={t('repo.create.password_confirmation')}
            className='w-full'
            inputSize='sm'
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={t('repo.create.password_confirmation')}
            type='password'
            value={confirmation}
          />

          <label className='flex items-center gap-2 text-ui-control'>
            <input
              checked={plaintextNames}
              onChange={(event) => setPlaintextNames(event.target.checked)}
              type='checkbox'
            />
            <span>{t('repo.create.plaintext_names')}</span>
          </label>

          <fieldset className='flex flex-col gap-1 border-0 p-0'>
            <legend className='text-ui-caption text-content-secondary'>
              {t('repo.create.cipher')}
            </legend>
            <div className='flex flex-wrap gap-1'>
              {CIPHERS.map((option) => (
                <Button
                  aria-pressed={cipher === option}
                  key={option}
                  onClick={() => setCipher(option)}
                  size='sm'
                  variant={cipher === option ? 'default' : 'outline'}
                >
                  {t(`repo.create.cipher_${option}`)}
                </Button>
              ))}
            </div>
          </fieldset>

          <fieldset className='flex flex-col gap-1 border-0 p-0'>
            <legend className='text-ui-caption text-content-secondary'>
              {t('repo.create.strength')}
            </legend>
            <div className='flex flex-wrap gap-1'>
              {STRENGTHS.map((option) => (
                <Button
                  aria-pressed={strength === option}
                  key={option}
                  onClick={() => setStrength(option)}
                  size='sm'
                  variant={strength === option ? 'default' : 'outline'}
                >
                  {t(`repo.create.strength_${option}`)}
                </Button>
              ))}
            </div>
          </fieldset>

          <p className='m-0 text-ui-caption text-content-muted'>{t('repo.create.warning')}</p>
          {error ? (
            <p className='m-0 text-ui-caption text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </Dialog.Body>

        <Dialog.Footer>
          <Button onClick={() => settle(null)} variant='outline'>
            {t('common.cancel')}
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {t('repo.create.submit')}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  )
})

export { MODAL_REPO_CREATE_ID }

export const RepoCreate = NiceModal.create(RepoCreateModal) as unknown as React.FC<{ id: string }>
