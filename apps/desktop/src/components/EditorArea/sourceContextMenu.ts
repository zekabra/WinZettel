import { showContextMenu } from '@/components/ui-v2/ContextMenu'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import type { MfCodemirrorView } from 'rme'
import { logger } from '@/helper/logger'

export interface SourceContextMenuLabels {
  cut: string
  copy: string
  paste: string
  selectAll: string
}

/**
 * The WebView's own context menu runs the browser's editing commands, which CodeMirror
 * ignores: "Select all" selected nothing and "Paste as plain text" went through the
 * Markdown paste handler. Owning the menu means acting on the CodeMirror document.
 *
 * Bound directly to the editor view (not looked up by file id) so it works from the pane
 * that actually received the click, including a second pane showing the same file.
 */
export const attachSourceContextMenu = (
  view: MfCodemirrorView,
  labels: () => SourceContextMenuLabels,
): (() => void) => {
  const handle = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const { state } = view.cm
    const selection = state.selection.main
    const hasSelection = selection.from !== selection.to
    const selectedText = hasSelection ? state.sliceDoc(selection.from, selection.to) : ''

    const insertPlainText = (text: string) => {
      if (!text) return
      const current = view.cm.state.selection.main
      view.cm.dispatch({
        changes: { from: current.from, to: current.to, insert: text },
        selection: { anchor: current.from + text.length },
        scrollIntoView: true,
      })
      view.cm.focus()
    }

    const readClipboard = () =>
      readText()
        .then(insertPlainText)
        .catch((error: unknown) => logger.error(error))

    showContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          value: 'cut',
          label: labels().cut,
          disabled: !hasSelection,
          handler: () => {
            void writeText(selectedText).catch((error: unknown) => logger.error(error))
            view.cm.dispatch({ changes: { from: selection.from, to: selection.to, insert: '' } })
            view.cm.focus()
          },
        },
        {
          value: 'copy',
          label: labels().copy,
          disabled: !hasSelection,
          handler: () => {
            void writeText(selectedText).catch((error: unknown) => logger.error(error))
          },
        },
        {
          value: 'paste',
          label: labels().paste,
          handler: () => {
            void readClipboard()
          },
        },
        {
          value: 'select_all',
          label: labels().selectAll,
          handler: () => {
            const end = view.cm.state.doc.length
            view.cm.dispatch({ selection: { anchor: 0, head: end }, scrollIntoView: true })
            view.cm.focus()
          },
        },
      ],
    })
  }

  view.cm.dom.addEventListener('contextmenu', handle, true)
  return () => view.cm.dom.removeEventListener('contextmenu', handle, true)
}
