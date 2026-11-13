/**
 * HTML → Markdown, for pasting rich content into the source editor.
 *
 * The WYSIWYG runtime is gone, so Ctrl+V in the source pane used to paste plain text even when
 * the clipboard carried formatted content from a browser or an office suite. This converts the
 * common inline and block constructs into Markdown, and leaves anything it does not understand
 * as its text content, which is always better than dropping it.
 */

// Only characters that would otherwise start Markdown syntax. Escaping prose punctuation like
// "." or "-" produced visible backslashes in the middle of ordinary sentences.
const escapeText = (value: string): string => value.replace(/([\\`*_[\]])/g, '\\$1')

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ')

const codeFenceFor = (code: string): string => (code.includes('```') ? '~~~' : '```')

function inlineChildren(node: Node): string {
  const parts: string[] = []
  node.childNodes.forEach((child) => {
    parts.push(renderInline(child))
  })
  return parts.join('')
}

function renderInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(collapseWhitespace(node.textContent ?? ''))
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()

  switch (tag) {
    case 'strong':
    case 'b':
      return wrap(inlineChildren(element), '**')
    case 'em':
    case 'i':
      return wrap(inlineChildren(element), '*')
    case 'u':
      return wrap(inlineChildren(element), '<u>', '</u>')
    case 's':
    case 'strike':
    case 'del':
      return wrap(inlineChildren(element), '~~')
    case 'code':
      return `\`${element.textContent ?? ''}\``
    case 'br':
      return '  \n'
    case 'a': {
      const href = element.getAttribute('href') ?? ''
      const label = inlineChildren(element) || escapeText(href)
      return href ? `[${label}](${href})` : label
    }
    case 'img': {
      const src = element.getAttribute('src') ?? ''
      const alt = element.getAttribute('alt') ?? ''
      return src ? `![${alt}](${src})` : ''
    }
    case 'span':
    case 'font':
    case 'small':
    case 'label':
      return inlineChildren(element)
    default:
      return inlineChildren(element)
  }
}

function wrap(value: string, before: string, after = before): string {
  const trimmed = value.trim()
  return trimmed ? `${before}${trimmed}${after}` : ''
}

function renderList(element: HTMLElement, ordered: boolean, depth: number): string {
  const indent = '  '.repeat(depth)
  const lines: string[] = []
  let index = 1

  element.childNodes.forEach((child) => {
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const item = child as HTMLElement
    if (item.tagName.toLowerCase() !== 'li') return

    const nested = Array.from(item.children).filter((node) =>
      ['ul', 'ol'].includes(node.tagName.toLowerCase()),
    )
    const own = Array.from(item.childNodes).filter(
      (node) => !(node.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes((node as HTMLElement).tagName.toLowerCase())),
    )
    const text = own
      .map((node) => (node.nodeType === Node.ELEMENT_NODE ? renderBlock(node as HTMLElement) : renderInline(node)))
      .join('')
      .trim()
      .replace(/\n+/g, ' ')

    lines.push(`${indent}${ordered ? `${index}.` : '-'} ${text}`)
    index += 1

    nested.forEach((node) => {
      const nestedTag = node.tagName.toLowerCase()
      lines.push(renderList(node as HTMLElement, nestedTag === 'ol', depth + 1))
    })
  })

  return lines.join('\n')
}

function renderTable(element: HTMLElement): string {
  const rows = Array.from(element.querySelectorAll('tr'))
  if (rows.length === 0) return ''

  const cellsOf = (row: HTMLTableRowElement) =>
    Array.from(row.children).map((cell) => inlineChildren(cell).trim().replace(/\n/g, ' '))

  const header = cellsOf(rows[0] as HTMLTableRowElement)
  const separator = header.map(() => '---')
  const body = rows.slice(1).map((row) => cellsOf(row as HTMLTableRowElement))

  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [line(header), line(separator), ...body.map(line)].join('\n')
}

function renderBlock(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = collapseWhitespace(node.textContent ?? '')
    return text ? escapeText(text) : ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag.slice(1))
      return `${'#'.repeat(level)} ${inlineChildren(element).trim()}`
    }
    case 'p':
      return inlineChildren(element).trim()
    case 'blockquote': {
      const inner = renderBlocks(element).trim()
      const quoted = inner
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n')
      return quoted
    }
    case 'pre': {
      const code = element.textContent ?? ''
      const languageClass = element.querySelector('code')?.className ?? ''
      const language = /language-([\w-]+)/.exec(languageClass)?.[1] ?? ''
      const fence = codeFenceFor(code)
      return `${fence}${language}\n${code.replace(/\n$/, '')}\n${fence}`
    }
    case 'ul':
      return renderList(element, false, 0)
    case 'ol':
      return renderList(element, true, 0)
    case 'table':
      return renderTable(element)
    case 'hr':
      return '---'
    case 'br':
      return '  \n'
    case 'div':
    case 'section':
    case 'article':
    case 'main':
    case 'header':
    case 'footer':
    case 'body':
      return renderBlocks(element)
    default:
      return inlineChildren(element).trim()
  }
}

function renderBlocks(parent: Node): string {
  const parts: string[] = []
  parent.childNodes.forEach((child) => {
    const block = renderBlock(child).trimEnd()
    if (block.trim()) parts.push(block)
  })
  return parts.join('\n\n')
}

/** Convert clipboard HTML into Markdown, or an empty string when there is nothing usable. */
export function htmlToMarkdown(html: string): string {
  if (!html.trim() || typeof DOMParser === 'undefined') return ''

  const document = new DOMParser().parseFromString(html, 'text/html')
  const markdown = renderBlocks(document.body)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return markdown
}

/** Plain text from clipboard HTML, for "paste as plain text" when no text format is readable. */
export function plainTextFromHtml(html: string): string {
  if (!html.trim() || typeof DOMParser === 'undefined') return ''

  const document = new DOMParser().parseFromString(html, 'text/html')
  const body = document.body

  // Block boundaries become line breaks; textContent alone would glue paragraphs together.
  body.querySelectorAll('br').forEach((element) => element.replaceWith('\n'))
  body.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre').forEach((element) => {
    element.appendChild(document.createTextNode('\n'))
  })

  return (body.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
