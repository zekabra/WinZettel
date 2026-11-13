import { useEffect } from 'react'
import { getSourceCodeEditor } from './sourceCodeEditorRegistry'
import { findBlockElement, revealBlockElement, sourceBlocks } from './previewBlocks'

/**
 * Keeps the reading pane on the block being edited.
 *
 * The preview is rebuilt on every content change, so the position is re-applied on each
 * mutation of that pane — a microtask, before paint, with no timers. The block map is read from
 * the source every time, so a late or early attempt cannot corrupt the next one.
 *
 * It only acts while the editor has focus, and it never moves the pane without a block that was
 * actually found: the old "jump to the start" came from treating a missing target as "top".
 */
export const useCaretFollowsPreview = (fileId: string, enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) return

    const panesOfFile = () =>
      Array.from(document.querySelectorAll<HTMLElement>(`[data-editor-id='${fileId}']`))

    const sourcePane = () => panesOfFile().find((pane) => pane.querySelector('.cm-editor'))
    const readingPanes = () => panesOfFile().filter((pane) => !pane.querySelector('.cm-editor'))

    const follow = () => {
      const editor = getSourceCodeEditor(fileId)
      const source = sourcePane()
      const focused = document.activeElement
      // Never fight the user: only follow while the caret is in the source pane.
      if (!editor || !source || !focused || !source.contains(focused)) return

      const panes = readingPanes()
      if (panes.length === 0) return

      const { state } = editor.cm
      const lines = state.doc.toString().split('\n')
      const caretLine = state.doc.lineAt(state.selection.main.head).number - 1
      const blocks = sourceBlocks(lines.join('\n'))
      if (blocks.length === 0) return

      for (const pane of panes) {
        const element = findBlockElement(pane, blocks, caretLine, lines)
        if (element) revealBlockElement(pane, element)
      }
    }

    const observers = readingPanes().map((pane) => {
      const observer = new MutationObserver(() => follow())
      observer.observe(pane, { childList: true, subtree: true })
      return observer
    })

    // A click or a keystroke moves the caret before the content reaches the preview.
    const source = sourcePane()
    source?.addEventListener('keyup', follow)
    source?.addEventListener('pointerup', follow)

    return () => {
      observers.forEach((observer) => observer.disconnect())
      source?.removeEventListener('keyup', follow)
      source?.removeEventListener('pointerup', follow)
    }
  }, [enabled, fileId])
}
