import { useTranslation } from '@/i18n'
import useEditorStore from '@/stores/useEditorStore'
import usePreviewFindStore from '@/stores/usePreviewFindStore'
import { SearchIcon } from 'lucide-react'
import { EditorAreaActionButton } from '../../EditorAreaAction'

/** Opens the reading pane's own find bar, independent from the source pane's search. */
export const PreviewFind = () => {
  const { t } = useTranslation()
  const groupId = useEditorStore((state) => state.activeGroupId)
  const open = usePreviewFindStore((state) => state.openGroups.includes(groupId ?? ''))
  const toggle = usePreviewFindStore((state) => state.toggle)

  return (
    <EditorAreaActionButton
      icon={SearchIcon}
      label={t('find_replace.find')}
      aria-pressed={open}
      onClick={() => toggle(groupId)}
    />
  )
}
