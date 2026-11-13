import { useEffect, useLayoutEffect, useRef } from 'react'
import { useTranslation } from '@/i18n'
import { closeEditorSearch, useEditorSearchStore } from '../../editorSearchStore'
import useEditorStore from '@/stores/useEditorStore'
import useEditorViewTypeStore, { selectEditorViewType } from '@/stores/useEditorViewTypeStore'
import { EditorViewType } from '@/constants/editorViewType'
import { FindReplaceControls } from './find-replace-component'
import { useEditorSearchController } from './use-editor-search'

interface FindReplaceProps {
  /** Pane that owns this bar; the controller targets it, not whichever pane has focus. */
  groupId?: string
  fileId?: string
}

export function FindReplace({ groupId, fileId }: FindReplaceProps = {}) {
  const controller = useEditorSearchController({ fileId, groupId })
  const activeId = fileId ?? useEditorStore((state) => state.activeId)
  const activeGroupId = groupId ?? useEditorStore((state) => state.activeGroupId)
  const mode = useEditorViewTypeStore((state) =>
    activeId ? selectEditorViewType(state, activeId, activeGroupId) : undefined,
  )
  // Another note means another search: the term is not reused across documents.
  const previousFile = useRef(activeId)
  useEffect(() => {
    if (previousFile.current === activeId) return
    previousFile.current = activeId
    // A global-search result opens another file on purpose; that is a navigation, not a
    // fresh search, so the pending reveal must survive.
    if (useEditorSearchStore.getState().navigation) return
    controller.dismiss?.()
    controller.stopFind()
  }, [activeId, controller])

  // Switching between source and preview dismisses the search: the bar belongs to the
  // pane that was being searched, not to the one that replaced it.
  const previousMode = useRef(mode)
  useEffect(() => {
    if (previousMode.current === mode) return
    previousMode.current = mode
    // A global-search result switches the pane mode on purpose; closing there would drop
    // the reveal that navigation is about to apply.
    if (useEditorSearchStore.getState().navigation) return
    closeEditorSearch()
  }, [mode])
  const ref = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  useLayoutEffect(() => {
    if (
      controller.open &&
      controller.available &&
      useEditorSearchStore.getState().focusedRevision !== controller.focusRevision
    ) {
      const input = ref.current?.querySelector('input')
      if (!input) return
      // Moving the bar between panes must not steal focus from the clicked
      // editor. Only consume an explicit open/refocus request, once ready.
      input.focus({ preventScroll: true })
      input.select()
      useEditorSearchStore.setState({ focusedRevision: controller.focusRevision })
    }
  }, [controller.open, controller.available, controller.focusRevision])

  if (!controller.open && !controller.error) return null
  return (
    <div ref={ref} data-slot='editor-find' className='shrink-0 bg-background p-2 text-foreground'>
      {controller.open ? <FindReplaceControls controller={controller} allowReplace={mode !== EditorViewType.PREVIEW} /> : null}
      {controller.error ? (
        <div role='status' className='mt-1 text-xs text-muted-foreground'>
          {t(`find_replace.navigation_${controller.error}`)}
        </div>
      ) : null}
    </div>
  )
}
