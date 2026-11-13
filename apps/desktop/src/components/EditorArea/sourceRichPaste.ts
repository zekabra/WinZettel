import { htmlToMarkdown } from '@/helper/htmlToMarkdown'
import { logger } from '@/helper/logger'

/** The part of a CodeMirror view this needs: its DOM element. */
export interface PasteHost {
  dom: HTMLElement
}

export interface RichPasteHandlers {
  /** Insert Markdown at the current selection. */
  insert: (markdown: string) => void
  /** Save pasted files (screenshots, image files) and return the Markdown to insert. */
  filesToMarkdown?: (files: File[]) => Promise<string | null>
  /** Save an image the clipboard carries as HTML or as a URI, and return the Markdown. */
  imageFromSource?: (source: string) => Promise<string | null>
}

/**
 * Rich paste for the source editor.
 *
 * CodeMirror pastes plain text on its own, so formatted content copied from a browser or an
 * office suite arrived stripped. This intercepts the paste event while the clipboard still has
 * `text/html`, converts it to Markdown, and inserts that. When the clipboard carries files
 * instead (a screenshot, an image file) they are saved through the normal attachment path and
 * inserted as an image link.
 */
const IMAGE_URL = /\.(png|jpe?g|gif|webp|svg|bmp|avif|tiff?)([?#]|$)/i

/** The first image source inside clipboard HTML, which is how a browser copies a picture. */
export const imageSourceFromHtml = (html: string): string | null => {
  const match = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html)
  return match ? match[1] : null
}

export const attachRichPaste = (
  view: PasteHost,
  handlers: RichPasteHandlers,
): (() => void) => {
  const handle = (event: ClipboardEvent) => {
    const data = event.clipboardData
    if (!data) return

    const files = Array.from(data.files ?? [])
    if (files.length > 0 && handlers.filesToMarkdown) {
      event.preventDefault()
      void handlers
        .filesToMarkdown(files)
        .then((markdown) => {
          if (markdown) handlers.insert(markdown)
        })
        .catch((error: unknown) => logger.error('Pasted file could not be saved:', error))
      return
    }

    const html = data.getData('text/html')

    // A picture copied in a browser arrives as HTML with a remote source, or as a URI. Save it
    // through the attachment pipeline so the note keeps a local file, not a link that dies.
    if (handlers.imageFromSource) {
      const htmlImage = imageSourceFromHtml(html)
      const uri = (data.getData('text/uri-list') || data.getData('text/plain') || '').trim()
      const source = htmlImage ?? (IMAGE_URL.test(uri) ? uri : null)
      if (source) {
        event.preventDefault()
        void handlers
          .imageFromSource(source)
          .then((markdown) => {
            if (markdown) handlers.insert(markdown)
          })
          .catch((error: unknown) => logger.error('Pasted image could not be saved:', error))
        return
      }
    }

    if (!html.trim()) return

    const markdown = htmlToMarkdown(html)
    if (!markdown.trim()) return

    event.preventDefault()
    handlers.insert(markdown)
  }

  view.dom.addEventListener('paste', handle, true)
  return () => view.dom.removeEventListener('paste', handle, true)
}
