import type { IHeadingData } from '@markflowy/interface'

/**
 * Outline for the preview pane.
 *
 * The rendered headings are the only outline the preview can offer: after the Capricorn
 * runtime was removed there is no editor-side heading tree behind it. Reading them from
 * the DOM keeps the table of contents usable in preview — the entries list what the
 * document shows and clicking one scrolls the pane.
 */
export const listPreviewHeadings = (fileId: string): IHeadingData[] => {
  if (!fileId || typeof document === 'undefined') return []
  const pane = document.querySelector<HTMLElement>(
    `[data-editor-active='true'][data-editor-id='${fileId}']`,
  )
  if (!pane) return []
  const container = pane.querySelector<HTMLElement>('.ProseMirror') ?? pane

  const headings: IHeadingData[] = []
  Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')).forEach(
    (element, index) => {
      const value = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!value) return
      headings.push({
        depth: Number(element.tagName.slice(1)) || 1,
        value,
        id: `preview-heading-${index}`,
        htmlNode: element,
        onClick: () => {
          const viewport = pane.querySelector<HTMLElement>('[data-overlayscrollbars-viewport]')
          if (!viewport) {
            element.scrollIntoView({ block: 'start' })
            return
          }
          const delta =
            element.getBoundingClientRect().top - viewport.getBoundingClientRect().top
          viewport.scrollTop += delta
        },
      })
    },
  )
  return headings
}
