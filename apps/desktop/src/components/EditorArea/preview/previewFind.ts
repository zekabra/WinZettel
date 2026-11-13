import type { IHeadingData } from '@markflowy/interface'

export interface PreviewMatch {
  range: Range
}

const HIGHLIGHT_NAME = 'mf-preview-find'
const ACTIVE_HIGHLIGHT_NAME = 'mf-preview-find-active'

const supportsHighlightApi = () =>
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'

/** Text nodes of the rendered preview, used as the search haystack. */
const previewTextNodes = (container: HTMLElement): Text[] => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      (node.textContent ?? '').trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  })
  const nodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    nodes.push(current as Text)
    current = walker.nextNode()
  }
  return nodes
}

/**
 * Find inside the reading pane.
 *
 * The preview has no CodeMirror document, so matches are DOM ranges painted with the CSS
 * Custom Highlight API — no nodes are inserted, which keeps the rendered Markdown intact.
 */
export const findInPreview = (
  container: HTMLElement,
  query: string,
  caseSensitive = false,
): PreviewMatch[] => {
  if (!query) return []
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: PreviewMatch[] = []

  for (const node of previewTextNodes(container)) {
    const text = caseSensitive ? node.textContent ?? '' : (node.textContent ?? '').toLowerCase()
    let index = text.indexOf(needle)
    while (index !== -1) {
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + query.length)
      matches.push({ range })
      index = text.indexOf(needle, index + needle.length)
    }
  }
  return matches
}

/** Paints all matches and the active one; safe to call with an empty list. */
export const paintPreviewMatches = (matches: PreviewMatch[], activeIndex: number): void => {
  if (!supportsHighlightApi()) return
  const highlights = (CSS as unknown as { highlights: Map<string, unknown> }).highlights
  if (matches.length === 0) {
    highlights.delete(HIGHLIGHT_NAME)
    highlights.delete(ACTIVE_HIGHLIGHT_NAME)
    return
  }
  const all = new Highlight(...matches.map((match) => match.range))
  highlights.set(HIGHLIGHT_NAME, all)

  const active = matches[activeIndex]
  if (active) highlights.set(ACTIVE_HIGHLIGHT_NAME, new Highlight(active.range))
  else highlights.delete(ACTIVE_HIGHLIGHT_NAME)
}

export const scrollPreviewMatchIntoView = (match: PreviewMatch | undefined): void => {
  const element = match?.range.startContainer.parentElement
  element?.scrollIntoView({ block: 'center' })
}

/** Kept for symmetry with the source outline helpers. */
export type { IHeadingData }
