import MarkdownIt from 'markdown-it'

/**
 * Which block of the note the caret is in, and which rendered element shows it.
 *
 * The reading pane follows the caret, and the mapping is decided by **block position**, not by
 * matching text. Text matching alone kept failing on blocks whose beginning is not text at all:
 * list markers (`- item`, `1. item`), markdown destinations (`[text](url)` → `text url`), and
 * blocks with no text whatsoever (a paragraph holding only an image, `---`, mermaid). Markdown
 * has a ground truth for this — the block boundaries computed by the parser — so the source
 * side comes from MarkdownIt's top-level token map and the rendered side from the pane's own
 * block order.
 *
 * Two rules make the behaviour safe:
 * - a block is only revealed after it is **found**; there is no fallback to the top;
 * - an unfinished render (fewer blocks than the source) reveals nothing at all.
 */

export interface SourceBlock {
  /** First source line (zero based). */
  from: number
  /** One past the last source line. */
  to: number
  /** MarkdownIt token type, e.g. `bullet_list_open` or `heading_open`. */
  type: string
}

const EXPECTED_TAGS: Record<string, string[]> = {
  bullet_list_open: ['UL'],
  ordered_list_open: ['OL'],
  blockquote_open: ['BLOCKQUOTE'],
  table_open: ['TABLE'],
  fence: ['PRE'],
  code_block: ['PRE'],
  hr: ['HR'],
  heading_open: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'],
  html_block: ['PRE', 'DIV', 'P'],
  paragraph_open: ['P'],
}

const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'HR',
  'FIGURE',
  'DL',
])

const MARKDOWN_NOISE = /[*_`~>#[\]()!|]/g
const DESTINATION = /\]\([^)]*\)|<[^>]+>|https?:\/\/\S+/g
const LINE_PREFIX = /^[ \t]*(?:[-*+]|\d+[.)]|>)\s+/gm
const PREFIX = 40
const LOOSE = 24

const parser = new MarkdownIt({ html: true })

export const normalizeForMatch = (value: string): string =>
  value.replace(MARKDOWN_NOISE, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

let cachedSource: string | null = null
let cachedBlocks: SourceBlock[] = []

/** Top-level blocks of the note, in document order, with their source lines. */
export const sourceBlocks = (markdown: string): SourceBlock[] => {
  if (markdown === cachedSource) return cachedBlocks

  const blocks = parser
    .parse(markdown, {})
    .filter((token) => token.level === 0 && token.map && token.nesting !== -1)
    .map((token) => ({
      from: token.map![0],
      to: token.map![1],
      type: token.type.replace(/_open$/, '_open'),
    }))

  cachedSource = markdown
  cachedBlocks = blocks
  return blocks
}

/** Index of the block containing a line, or -1 for a blank line or an unknown position. */
export const blockIndexAtLine = (blocks: readonly SourceBlock[], line: number): number =>
  blocks.findIndex((block) => block.from <= line && line < block.to)

/**
 * What identifies the block when its rendered element is checked: its text without markdown
 * syntax and destinations, plus the image it may contain.
 */
export const blockIdentity = (
  lines: readonly string[],
  block: SourceBlock | undefined,
): { text: string; image: string | null; alt: string } => {
  if (!block) return { text: '', image: null, alt: '' }

  const source = lines.slice(block.from, block.to)
  const joined = source.join(' ')
  const image =
    /!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/.exec(joined)?.[1] ??
    /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(joined)?.[1] ??
    null

  // Only the opening line: a rendered list joins its items without the "- " separators that
  // the source has, so a prefix built from several lines can never match. A table is worse —
  // every cell's text is concatenated — so its identity is the first cell with content.
  const openingLine = source[0] ?? ''
  const candidates =
    block?.type === 'table_open'
      ? openingLine.split('|').map((cell) => cell.trim()).filter(Boolean).slice(0, 1)
      : [openingLine]

  let text = ''
  for (const line of candidates.length > 0 ? candidates : source) {
    text = normalizeForMatch(line.replace(LINE_PREFIX, '').replace(DESTINATION, ' '))
    if (text.length >= 3) break
  }

  const alt = normalizeForMatch(
    /!\[([^\]]*)\]\(/.exec(joined)?.[1] ?? /<img[^>]+alt\s*=\s*["']([^"']*)["']/i.exec(joined)?.[1] ?? '',
  )

  return { text: text.slice(0, PREFIX), image, alt }
}

/** The pane's own blocks, in document order. Wrappers that hold a single block are transparent. */
export const renderedBlocks = (container: ParentNode): HTMLElement[] => {
  const blocks: HTMLElement[] = []

  const visit = (parent: ParentNode) => {
    Array.from(parent.children).forEach((child) => {
      const element = child as HTMLElement
      const nested = Array.from(element.children).filter((node) =>
        BLOCK_TAGS.has((node as HTMLElement).tagName),
      )

      if (BLOCK_TAGS.has(element.tagName)) {
        // A div holding blocks and no text of its own is a layout wrapper, not a block.
        const ownText = Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim()
        if (element.tagName === 'DIV' && nested.length > 0 && !ownText) {
          visit(element)
          return
        }
        blocks.push(element)
        return
      }

      visit(element)
    })
  }

  visit(container)
  return blocks
}

const fileNameOf = (value: string): string => {
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // Keep the raw value when it is not valid percent-encoding.
  }
  const withoutQuery = decoded.split(/[?#]/, 1)[0]
  return (withoutQuery.split(/[\\/]/).pop() ?? '').toLowerCase()
}

const refersToSameImage = (renderedSource: string, wanted: string): boolean => {
  if (!renderedSource) return false
  if (renderedSource.includes(wanted)) return true
  const renderedName = fileNameOf(renderedSource)
  return Boolean(renderedName) && renderedName === fileNameOf(wanted)
}

const revealsIdentity = (
  element: HTMLElement,
  identity: { text: string; image: string | null; alt: string },
  block: SourceBlock | undefined,
): boolean => {
  const image = element.querySelector('img') ?? (element.tagName === 'IMG' ? element : null)

  if (identity.image && image) {
    // The pane may rewrite the source (asset:, blob:, data:), so compare the file name, then
    // the alternative text, before giving up.
    if (refersToSameImage(image.getAttribute('src') ?? '', identity.image)) return true
    if (identity.alt) {
      const alt = normalizeForMatch(image.getAttribute('alt') ?? '')
      if (alt && (alt.startsWith(identity.alt) || identity.alt.startsWith(alt))) return true
    }
  }

  if (identity.text) {
    const rendered = normalizeForMatch(element.textContent ?? '')
    if (rendered.startsWith(identity.text)) return true
    if (identity.text.length >= 8 && rendered.includes(identity.text.slice(0, LOOSE))) return true
  }

  // Structural check: the block is at the expected position and its rendered shape is the one
  // this kind of source block produces. A list keeps being a list, an image paragraph still
  // holds an image — even when every piece of its text was rewritten.
  const expected = block ? EXPECTED_TAGS[block.type] : undefined
  if (!expected) return false
  if (identity.image) return Boolean(image)
  return expected.includes(element.tagName)
}

/**
 * The element showing the caret's block. `undefined` means "leave the pane alone": either the
 * caret is not in a block, or the render has not produced that block yet.
 */
export const findBlockElement = (
  container: ParentNode,
  blocks: readonly SourceBlock[],
  caretLine: number,
  lines: readonly string[],
): HTMLElement | undefined => {
  const index = blockIndexAtLine(blocks, caretLine)
  if (index < 0) return undefined

  const elements = renderedBlocks(container)
  if (elements.length === 0 || elements.length <= index) return undefined

  const identity = blockIdentity(lines, blocks[index])
  const candidate = elements[index]
  if (candidate && revealsIdentity(candidate, identity, blocks[index])) return candidate

  // The renderer may merge or split a neighbouring block; accept a small correction, never a
  // jump somewhere else.
  for (const offset of [1, -1, 2, -2]) {
    const other = elements[index + offset]
    if (other && revealsIdentity(other, identity, blocks[index + offset])) return other
  }

  return undefined
}

/** Brings the block to the top of the pane. Returns whether it had to move. */
export const revealBlockElement = (container: HTMLElement, element: HTMLElement): boolean => {
  const scroller =
    container.querySelector<HTMLElement>('[data-overlayscrollbars-viewport]') ?? container
  const delta = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  if (Math.abs(delta) < 4) return false
  scroller.scrollTop += delta
  return true
}
