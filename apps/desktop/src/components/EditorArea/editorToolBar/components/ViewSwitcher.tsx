import bus from '@/helper/eventBus'
import {
  EditorViewType,
  type EditorViewTarget,
  type EditorViewTypeValue,
} from '@/constants/editorViewType'
import { getFileObject } from '@/helper/files'
import { useEditorStore } from '@/stores'
import useEditorViewTypeStore, { selectEditorViewType } from '@/stores/useEditorViewTypeStore'
import useFileTypeConfigStore from '@/stores/useFileTypeConfigStore'
import { cn } from '@/lib/cn'
import type { LucideIcon } from 'lucide-react'
import { CodeXmlIcon, EyeIcon } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from '@/i18n'
import { EditorAreaActionButton } from '../../EditorAreaAction'

interface ViewSwitcherProps {
  editorId?: string
  groupId?: string
}

const VIEW_TYPES: EditorViewTypeValue[] = [EditorViewType.PREVIEW, EditorViewType.SOURCECODE]

const VIEW_TYPE_ICONS: Record<EditorViewTypeValue, LucideIcon> = {
  [EditorViewType.SOURCECODE]: CodeXmlIcon,
  [EditorViewType.PREVIEW]: EyeIcon,
}

const VIEW_TYPE_LABELS: Record<EditorViewTypeValue, string> = {
  [EditorViewType.SOURCECODE]: 'view.source_code',
  [EditorViewType.PREVIEW]: 'view.preview',
}

/**
 * Both modes are on screen as their own button, so switching is one click instead
 * of opening a menu. Only the modes the current file type supports are shown.
 */
export const ViewSwitcher = (props: ViewSwitcherProps) => {
  const { editorId, groupId } = props
  const activeId = useEditorStore((state) => state.activeId)
  const targetEditorId = editorId ?? activeId
  const editorViewType = useEditorViewTypeStore((state) =>
    selectEditorViewType(state, targetEditorId ?? '', groupId),
  )
  const { t } = useTranslation()

  const curFile = targetEditorId ? getFileObject(targetEditorId) : undefined
  const supportedModes =
    useFileTypeConfigStore.getState().getFileTypeConfigById(curFile?.id || '')?.supportedModes ??
    []

  const handleSelect = useCallback(
    (viewType: EditorViewTypeValue) => {
      if (!targetEditorId) return
      const target: EditorViewTarget = { editorId: targetEditorId, groupId }
      bus.emit('editor_toggle_type', undefined, viewType, target)
    },
    [groupId, targetEditorId],
  )

  if (!curFile) return null

  const modes = VIEW_TYPES.filter((viewType) => supportedModes.includes(viewType))
  if (modes.length === 0) return null

  return (
    <div
      className='flex shrink-0 items-center gap-0.5'
      role='group'
      aria-label={t('view.label')}
    >
      {modes.map((viewType) => {
        const active = editorViewType === viewType
        return (
          <EditorAreaActionButton
            key={viewType}
            icon={VIEW_TYPE_ICONS[viewType]}
            label={t(VIEW_TYPE_LABELS[viewType])}
            aria-pressed={active}
            className={cn(active && 'bg-[var(--mf-ui-hover-bg)] text-foreground')}
            onClick={() => handleSelect(viewType)}
          />
        )
      })}
    </div>
  )
}
