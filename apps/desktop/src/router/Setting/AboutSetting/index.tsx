import { openUrl } from '@tauri-apps/plugin-opener'
import { useTranslation } from '@/i18n'
import { Button } from '@/components/ui/button'
import { dialog } from '@/services/dialog'
import { toast } from 'zens'
import { logger } from '@/helper/logger'
import { resetAppData } from '@/services/app-reset'
import { SettingGroupContainer } from '../component/SettingGroup/styles'

const MARKFLOWY_URL = 'https://github.com/drl990114/MarkFlowy'

export const AboutSetting = () => {
  const { t } = useTranslation()

  const reset = async () => {
    const action = await dialog.confirm({
      title: t('settings.about.reset.title'),
      content: t('settings.about.reset.description'),
      actions: [
        { id: 'restart', label: t('settings.about.reset.restart'), danger: true },
        { id: 'reset', label: t('settings.about.reset.plain') },
        { id: 'cancel', label: t('common.cancel') },
      ],
    })
    if (action !== 'restart' && action !== 'reset') return

    try {
      const failed = await resetAppData(action === 'restart')
      if (failed.length > 0) {
        // The WebView profile is in use while running; the rest is already gone.
        toast.error(t('settings.about.reset.partial'), { description: failed.join('\n') })
        return
      }
      if (action === 'reset') toast.success(t('settings.about.reset.done'))
    } catch (error) {
      logger.error(error)
      toast.error(t('settings.about.reset.failed'))
    }
  }

  return (
    <SettingGroupContainer>
      <h2 className='setting-group__title'>{t('settings.about.label')}</h2>
      <div className='setting-group__items'>
        <p className='text-sm leading-relaxed text-foreground'>
          {t('settings.about.fork')}{' '}
          <button
            type='button'
            className='text-primary underline-offset-2 hover:underline'
            onClick={() => void openUrl(MARKFLOWY_URL)}
          >
            {MARKFLOWY_URL}
          </button>
        </p>
        <p className='text-sm leading-relaxed text-muted-foreground'>
          {t('settings.about.compatibility')}
        </p>
        <div className='flex flex-col gap-2 border-t border-border pt-3'>
          <p className='text-sm font-medium text-foreground'>{t('settings.about.reset.label')}</p>
          <p className='text-sm leading-relaxed text-muted-foreground'>
            {t('settings.about.reset.hint')}
          </p>
          <div>
            <Button variant='destructive' size='sm' onClick={() => void reset()}>
              {t('settings.about.reset.action')}
            </Button>
          </div>
        </div>
      </div>
    </SettingGroupContainer>
  )
}
