import { useEditorStore } from '@/stores'
import { EditorViewType } from '@/constants/editorViewType'
import useEditorViewTypeStore, { selectEditorViewType } from '@/stores/useEditorViewTypeStore'
import { type FC, useMemo } from 'react'
import { ToolbarSection, usePriorityHidden, ToolbarWrapper } from '@markflowy/interface'
import { MenuList } from '../components/MenuList'
import { ViewSwitcher } from '../components/ViewSwitcher'
import { PreviewFind } from './PreviewFind'
import { BookmarkAction } from '../BookmarkAction'
import { useToolbarDisabled } from '../useToolbarDisabled'

interface PreviewToolbarProps {
  editorId?: string
  groupId?: string
}

export const PreviewToolbar: FC<PreviewToolbarProps> = (props) => {
  const { editorId, groupId } = props
  const activeId = useEditorStore((state) => state.activeId)
  const targetEditorId = editorId ?? activeId

  const viewType = useEditorViewTypeStore((state) =>
    selectEditorViewType(state, targetEditorId ?? '', groupId),
  )

  // Locked note or unsupported format disables the whole toolbar, so any icon added later
  // is inert too.
  const locked = useToolbarDisabled(targetEditorId)

  const sections = useMemo(() => [{ id: 'common', priority: 100 }], [])

  const { containerRef, registerItemWidth } = usePriorityHidden({
    items: sections,
    gap: 0,
  })

  if (viewType !== EditorViewType.PREVIEW) {
    return null
  }

  return (
    <ToolbarWrapper
      aria-disabled={locked || undefined}
      className='mf-editor-toolbar'
      inert={locked || undefined}
      ref={containerRef}
      style={locked ? { opacity: 0.55, pointerEvents: 'none' } : undefined}
    >
      <ToolbarSection
        id='common'
        registerWidth={registerItemWidth}
        hidden={false}
      >
        <ViewSwitcher editorId={targetEditorId} groupId={groupId} />
        <MenuList editorId={targetEditorId} groupId={groupId} />
        <BookmarkAction editorId={targetEditorId} />
        <PreviewFind />
      </ToolbarSection>
    </ToolbarWrapper>
  )
}
