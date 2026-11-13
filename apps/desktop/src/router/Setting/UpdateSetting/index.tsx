import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { fetchUpdate, installUpdate } from '@/helper/updater'
import useAppInfoStore from '@/stores/useAppInfoStore'
import useUpdaterStore from '@/stores/useUpdaterStore'
import { DownloadIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'

/**
 * Updates are manual only: nothing is checked at launch, and this page is the one
 * place that asks the release feed for a newer version.
 */
export function UpdateSetting() {
  const { t } = useTranslation()
  const { appInfo } = useAppInfoStore()
  const update = useUpdaterStore((state) => state.update)
  const isInstalling = useUpdaterStore((state) => state.isInstalling)
  const [checking, setChecking] = useState(false)
  const [checkedOnce, setCheckedOnce] = useState(false)

  const check = async () => {
    setChecking(true)
    try {
      await fetchUpdate()
      setCheckedOnce(true)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-1'>
        <span className='text-sm text-foreground'>
          {t('settings.updates.current_version')}: v{appInfo?.version ?? '—'}
        </span>
        <span className='text-ui-caption text-muted-foreground'>
          {t('settings.updates.manual_hint')}
        </span>
      </div>

      <div className='flex items-center gap-2'>
        <Button variant='outline' size='sm' disabled={checking || isInstalling} onClick={() => void check()}>
          <RefreshCwIcon aria-hidden='true' className='size-3.5' />
          {checking ? t('settings.updates.checking') : t('settings.updates.check_now')}
        </Button>
        {update ? (
          <Button size='sm' disabled={isInstalling} onClick={() => void installUpdate(update)}>
            <DownloadIcon aria-hidden='true' className='size-3.5' />
            {t('settings.updates.install_version', { version: update.version })}
          </Button>
        ) : null}
      </div>

      {checkedOnce && !update ? (
        <span className='text-ui-caption text-muted-foreground'>
          {t('settings.updates.up_to_date')}
        </span>
      ) : null}
      {update ? (
        <span className='text-ui-caption text-muted-foreground'>
          {t('settings.updates.available', { version: update.version })}
        </span>
      ) : null}
    </div>
  )
}
