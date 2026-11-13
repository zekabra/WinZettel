import { t } from '@/i18n'
import { FileQuestionIcon } from 'lucide-react'

interface UnsupportedFileTypeProps {
  fileName?: string
}

/** Shown instead of the editor for a format the app cannot read. */
export function UnsupportedFileType({ fileName }: UnsupportedFileTypeProps) {
  return (
    <div
      className='flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-app p-6 text-center'
      data-slot='unsupported-file'
      role='status'
    >
      <FileQuestionIcon aria-hidden='true' className='mb-1 size-6 text-content-muted' strokeWidth={1.5} />
      <p className='m-0 text-ui-control font-medium text-content-primary'>
        {t('file.unsupportedFileType')}
      </p>
      {fileName ? (
        <p className='m-0 max-w-80 truncate text-ui-caption text-content-secondary' title={fileName}>
          {fileName}
        </p>
      ) : null}
      <p className='m-0 max-w-80 text-ui-caption text-content-muted'>
        {t('file.unsupportedFileTypeDesc')}
      </p>
    </div>
  )
}
