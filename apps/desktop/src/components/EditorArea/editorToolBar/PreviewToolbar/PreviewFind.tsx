import { useTranslation } from '@/i18n'
import useEditorStore from '@/stores/useEditorStore'
import usePreviewFindStore from '@/stores/usePreviewFindStore'
import { SearchIcon } from 'lucide-react'
import { EditorAreaActionButton } from '../../EditorAreaAction'
import { useNoteIsLocked } from '../../useLockedNote'

/** Opens the reading pane's own find bar, independent from the source pane's search. */
export const PreviewFind = () => {
  const { t } = useTranslation()
  const groupId = useEditorStore((state) => state.activeGroupId)
  const activeId = useEditorStore((state) => state.activeId)
  const locked = useNoteIsLocked(activeId)
  const open = usePreviewFindStore((state) => state.openGroups.includes(groupId ?? ''))
  const toggle = usePreviewFindStore((state) => state.toggle)

  return (
    <EditorAreaActionButton
      aria-disabled={locked || undefined}
      aria-pressed={open}
      className={locked ? 'opacity-50' : undefined}
      icon={SearchIcon}
      label={locked ? t('encryption.locked.toolbar_hint') : t('find_replace.find')}
      onClick={() => {
        if (locked) return
        toggle(groupId)
      }}
    />
  )
}
