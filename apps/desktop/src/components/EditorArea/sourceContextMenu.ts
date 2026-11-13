import { showContextMenu } from '@/components/ui-v2/ContextMenu'
import { toast } from 'zens'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { clipboardRead, readClipboardImageDataUrl } from '@/helper/clipboard'
import { htmlToMarkdown, plainTextFromHtml } from '@/helper/htmlToMarkdown'
import { handleImagePaste } from './imageHandlers'
import type { MfCodemirrorView } from 'rme'
import { logger } from '@/helper/logger'
import { buildEditorContextItems, type EditorContextMenuTitles } from './editorContextActions'

export interface SourceContextMenuLabels {
  cut: string
  copy: string
  paste: string
  pasteRich: string
  pasteEmpty: string
  pastePlain: string
  selectAll: string
}

export interface SourceContextMenuScope {
  fileId: string
  groupId?: string
  titles: EditorContextMenuTitles
}

/**
 * The WebView's own context menu runs the browser's editing commands, which CodeMirror
 * ignores: "Select all" selected nothing and "Paste as plain text" went through the
 * Markdown paste handler. Owning the menu means acting on the CodeMirror document.
 *
 * Bound directly to the editor view (not looked up by file id) so it works from the pane
 * that actually received the click, including a second pane showing the same file. Only
 * the source pane attaches it, so the reading pane never shows these actions.
 */
export const attachSourceContextMenu = (
  view: MfCodemirrorView,
  labels: () => SourceContextMenuLabels,
  scope: SourceContextMenuScope,
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

    const readClipboard = async () => {
      // Three sources, because each one can come up empty in a different situation: the app's
      // own command, the web clipboard API, and the plugin. A silent failure is what made this
      // item look dead, so every miss is logged and a final failure is reported to the user.
      const sources: Array<{ name: string; read: () => Promise<string> }> = [
        { name: 'backend', read: async () => (await clipboardRead()).text },
        {
          name: 'web',
          read: async () => (navigator.clipboard ? navigator.clipboard.readText() : ''),
        },
        { name: 'plugin', read: readText },
      ]

      for (const source of sources) {
        try {
          const text = await source.read()
          if (text && text.trim()) {
            insertPlainText(text)
            return
          }
          logger.info(`Clipboard text is empty through ${source.name}`)
        } catch (error) {
          logger.warn(`Clipboard text could not be read through ${source.name}:`, error)
        }
      }

      // Last resort: the clipboard HTML is readable even when no text format comes back, so
      // take its text content. This is what makes pasting from a web page work every time.
      try {
        const { html } = await clipboardRead()
        const text = plainTextFromHtml(html)
        if (text) {
          insertPlainText(text)
          return
        }
      } catch (error) {
        logger.warn('Clipboard HTML could not be read:', error)
      }

      toast.error(labels().pasteEmpty)
    }

    // "Paste" keeps the formatting the clipboard carries; the plain item is the one that
    // inserts the text exactly as copied.
    const readClipboardRich = async () => {
      // A picture on the clipboard is a bitmap, not text: save it as an attachment first.
      try {
        const imageDataUrl = await readClipboardImageDataUrl()
        if (imageDataUrl) {
          const link = await handleImagePaste(imageDataUrl, scope.fileId)
          insertPlainText(link && link !== imageDataUrl ? `![](${link})` : `![](${imageDataUrl})`)
          return
        }
      } catch (error) {
        logger.warn('Clipboard image could not be saved:', error)
      }

      try {
        const { html } = await clipboardRead()
        const markdown = html ? htmlToMarkdown(html) : ''
        if (markdown.trim()) {
          insertPlainText(markdown)
          return
        }
      } catch (error) {
        logger.warn('Clipboard has no HTML:', error)
      }
      await readClipboard()
    }

    showContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        ...buildEditorContextItems({
          view,
          fileId: scope.fileId,
          groupId: scope.groupId,
          titles: scope.titles,
        }),
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
          label: labels().pasteRich,
          handler: () => {
            void readClipboardRich()
          },
        },
        {
          value: 'paste_plain',
          label: labels().pastePlain,
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
