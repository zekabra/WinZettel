import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import appSettingService from '@/services/app-setting'
import { dialog } from '@/services/dialog'
import { ENCRYPTION_PASSPHRASE_KEY, getEncryptionPassphrase } from '@/services/note-encryption'
import useAppSettingStore from '@/stores/useAppSettingStore'
import { KeyRoundIcon, ShieldOffIcon } from 'lucide-react'
import type { SettingItemProps } from '.'
import { SettingItemContainer } from './Container'
import { SettingLabel } from './Label'

const PassphraseSettingItem: React.FC<SettingItemProps<Setting.PassphraseSettingItem>> = (props) => {
  const { item } = props
  const { t } = useTranslation()
  useAppSettingStore((state) => state.settingData[ENCRYPTION_PASSPHRASE_KEY])
  const passphrase = getEncryptionPassphrase()
  const configured = passphrase.length > 0

  const askPassphrase = async (titleKey: string) => {
    const value = await dialog.inputConfirm({
      title: t(titleKey),
      inputProps: {
        type: 'password',
        placeholder: t('settings.encryption.passphrase.placeholder'),
        'aria-label': t('settings.encryption.passphrase.placeholder'),
      },
    })
    if (typeof value !== 'string' || !value.trim()) return
    await appSettingService.writeSettingData(item, value.trim())
  }

  return (
    <SettingItemContainer $settingKey={item.key}>
      <SettingLabel item={item} />
      <div className='setting-item__control flex min-w-0 flex-col items-end gap-1'>
        {configured ? (
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              void (async () => {
                const confirmed = await dialog.confirm({
                  title: t('settings.encryption.passphrase.reset_confirm_title'),
                  content: t('settings.encryption.passphrase.reset_confirm'),
                  actions: [
                    { id: 'cancel', label: t('common.cancel') },
                    {
                      id: 'reset',
                      label: t('settings.encryption.passphrase.reset'),
                      primary: true,
                    },
                  ],
                })
                if (confirmed !== 'reset') return
                await appSettingService.writeSettingData(item, '')
              })()
            }}
          >
            <ShieldOffIcon aria-hidden='true' className='size-3.5' />
            {t('settings.encryption.passphrase.reset')}
          </Button>
        ) : (
          <Button
            size='sm'
            onClick={() => {
              void askPassphrase('settings.encryption.passphrase.set')
            }}
          >
            <KeyRoundIcon aria-hidden='true' className='size-3.5' />
            {t('settings.encryption.passphrase.set')}
          </Button>
        )}
        <span className='max-w-full break-all text-right text-xs text-muted-foreground'>
          {configured
            ? t('settings.encryption.passphrase.configured')
            : t('settings.encryption.passphrase.not_configured')}
        </span>
      </div>
    </SettingItemContainer>
  )
}

export default PassphraseSettingItem
