import NiceModal from '@ebay/nice-modal-react'
import { Button } from '@/components/ui/button'
import type { RepoCreateResult } from '@/components/Modal'
import { MODAL_REPO_CREATE_ID } from '@/constants/modals'
import { useTranslation } from '@/i18n'
import { ensureRepoUnlocked } from '@/services/repo'
import { useEditorStore } from '@/stores'
import { FolderLockIcon } from 'lucide-react'
import type { SettingItemProps } from '.'
import { SettingItemContainer } from './Container'
import { SettingLabel } from './Label'

/**
 * Creating an encrypted repository lives in Settings, not in the workspace menu: it is a
 * one-off decision about storage, not a daily action.
 */
const RepositorySettingItem: React.FC<SettingItemProps<Setting.RepositorySettingItem>> = (props) => {
  const { item } = props
  const { t } = useTranslation()
  const rootPath = useEditorStore((state) => state.folderData?.[0]?.path)

  const handleCreate = async () => {
    const created = await NiceModal.show<RepoCreateResult | null>(MODAL_REPO_CREATE_ID)
    if (!created?.path) return
    if (await ensureRepoUnlocked(created.path)) {
      await NiceModal.hide(MODAL_REPO_CREATE_ID)
    }
  }

  return (
    <SettingItemContainer $settingKey={item.key}>
      <SettingLabel item={item} />
      <div className='setting-item__control flex min-w-0 flex-col items-end gap-1'>
        <Button onClick={() => void handleCreate()} size='sm'>
          <FolderLockIcon aria-hidden='true' className='size-3.5' />
          {t('settings.encryption.repository.create')}
        </Button>
        {rootPath ? null : (
          <span className='max-w-full text-right text-ui-caption text-content-muted'>
            {t('settings.encryption.repository.hint')}
          </span>
        )}
      </div>
    </SettingItemContainer>
  )
}

export default RepositorySettingItem
