import { Button } from '@/components/ui/button'
import { LockIcon } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { unlockNote } from '@/services/noteUnlock'

interface LockedNotePaneProps {
  filePath: string
  title: string
}

/**
 * What an encrypted note shows instead of the editor.
 *
 * The editor is not mounted at all: mounting it would put the ciphertext (or a stand-in for
 * it) in a document that the save path writes back, which destroys the note.
 */
export const LockedNotePane = ({ filePath, title }: LockedNotePaneProps) => {
  const { t } = useTranslation()

  return (
    <div className='flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center'>
      <LockIcon aria-hidden='true' size={28} strokeWidth={1.5} />
      <div className='max-w-sm text-ui-body'>{t('encryption.locked.notice')}</div>
      <div className='text-ui-caption text-muted-foreground'>{title}</div>
      <Button
        size='sm'
        variant='outline'
        onClick={() => {
          void unlockNote(filePath, true)
        }}
      >
        {t('encryption.locked.unlock')}
      </Button>
    </div>
  )
}
