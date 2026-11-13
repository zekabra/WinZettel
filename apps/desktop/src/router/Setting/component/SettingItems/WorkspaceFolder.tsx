import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { useOpen } from '@/hooks'
import useEditorStore from '@/stores/useEditorStore'
import { FolderOpenIcon } from 'lucide-react'
import type { SettingItemProps } from '.'
import { SettingItemContainer } from './Container'
import { SettingLabel } from './Label'

const WorkspaceFolderSettingItem: React.FC<SettingItemProps<Setting.WorkspaceFolderSettingItem>> = (
  props,
) => {
  const { item } = props
  const { t } = useTranslation()
  const { openFolderDialog } = useOpen()
  const workspacePath = useEditorStore((state) => state.folderData?.[0]?.path)

  return (
    <SettingItemContainer $settingKey={item.key}>
      <SettingLabel item={item} />
      <div className='setting-item__control flex min-w-0 flex-col items-end gap-1'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            void openFolderDialog()
          }}
        >
          <FolderOpenIcon aria-hidden='true' className='size-3.5' />
          {t('settings.general.workspace.folder.change')}
        </Button>
        <span className='max-w-full break-all text-right text-xs text-muted-foreground'>
          {workspacePath || t('settings.general.workspace.folder.empty')}
        </span>
      </div>
    </SettingItemContainer>
  )
}

export default WorkspaceFolderSettingItem
