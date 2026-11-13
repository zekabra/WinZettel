import { useEffect } from 'react'
import { getSourceCodeEditor } from './sourceCodeEditorRegistry'
import { caretAnchor, findAnchorElement, revealAnchorElement } from './caretAnchor'

/**
 * Keeps the reading pane on the paragraph being edited.
 *
 * The preview is rebuilt on every content change, so the position is re-applied on each
 * mutation of that pane — a microtask, before paint, with no timers. The anchor is read
 * from the source every time, so a late or early attempt cannot corrupt the next one.
 *
 * It only acts while the editor has focus: scrolling the reading pane is never undone.
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
      const anchor = caretAnchor(lines, caretLine)
      if (!anchor) return

      for (const pane of panes) {
        const element = findAnchorElement(pane, anchor)
        if (element) revealAnchorElement(pane, element)
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
