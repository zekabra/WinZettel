/**
 * The reading pane follows the caret: whenever the note is re-rendered, the paragraph being
 * edited is brought back into view.
 *
 * Lessons from earlier attempts, kept as rules here:
 * - no ratios: the rendered height does not follow line counts once images are involved;
 * - no timers: a position restored on a schedule loses the race against image loading;
 * - no element references: the pane replaces its subtree, so a stored node goes stale.
 * The anchor is text taken from the source at each attempt, which makes every attempt
 * idempotent: if one lands early, the next one corrects it.
 */

const MARKDOWN_NOISE = /[*_`~>#[\]()!|]/g
const PREFIX = 40

export const normalizeForMatch = (value: string): string =>
  value.replace(MARKDOWN_NOISE, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

/** Lines of the block around the caret: paragraphs, items and quotes are separated by blanks. */
export const blockAround = (lines: readonly string[], caretLine: number): string[] => {
  const index = Math.min(Math.max(caretLine, 0), Math.max(lines.length - 1, 0))
  if (!lines[index]?.trim()) return []
  let start = index
  while (start > 0 && (lines[start - 1] ?? '').trim()) start -= 1
  let end = index
  while (end + 1 < lines.length && (lines[end + 1] ?? '').trim()) end += 1
  return lines.slice(start, end + 1)
}

/** What identifies the block under the caret in the rendered note. */
export const caretAnchor = (lines: readonly string[], caretLine: number): string => {
  const block = blockAround(lines, caretLine)
  if (block.length === 0) return ''
  const heading = /^(#{1,6})\s+(.*)$/.exec(block[0].trim())
  const text = normalizeForMatch(heading?.[2] ?? block.join(' '))
  return text.slice(0, PREFIX)
}

const RENDERED_BLOCKS = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, td, th'

/** The element whose text matches the anchor, in document order. */
export const findAnchorElement = (
  container: ParentNode,
  anchor: string,
): HTMLElement | undefined => {
  if (!anchor) return undefined
  const elements = Array.from(container.querySelectorAll<HTMLElement>(RENDERED_BLOCKS))
  const exact = elements.find((element) =>
    normalizeForMatch(element.textContent ?? '').startsWith(anchor),
  )
  if (exact) return exact
  // The renderer may join or split the text slightly; accept a loose match on a shorter
  // prefix rather than doing nothing.
  const loose = anchor.slice(0, 24)
  return textStartsWith(elements, loose)
}

const textStartsWith = (elements: HTMLElement[], prefix: string): HTMLElement | undefined =>
  prefix.length >= 8
    ? elements.find((element) => normalizeForMatch(element.textContent ?? '').includes(prefix))
    : undefined

/** Brings the anchor to the top of the pane. Returns whether it had to move. */
export const revealAnchorElement = (
  container: HTMLElement,
  element: HTMLElement,
): boolean => {
  const scroller =
    container.querySelector<HTMLElement>('[data-overlayscrollbars-viewport]') ?? container
  const delta = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  if (Math.abs(delta) < 4) return false
  scroller.scrollTop += delta
  return true
}
