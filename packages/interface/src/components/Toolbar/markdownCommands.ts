import type { ChangeSpec } from '@codemirror/state'
import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

// URL regex for validating URLs in links/images - simplified version
// Matches common URL patterns and email addresses
const urlRE = /^(https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s]+$/i

export interface ClipboardReadResult {
  text: string
}

export type ClipboardReadFunction = () => Promise<ClipboardReadResult>

function insertLinkOrImage(
  target: EditorView,
  type: 'link' | 'image',
  clipboardRead?: ClipboardReadFunction
) {
  const pre = type === 'image' ? '!' : ''

  const insertWithText = (text: string) => {
    const url = urlRE.test(text || '') ? text : ''

    const transaction = target.state.changeByRange(({ from, to }) => {
      const title = target.state.sliceDoc(from, to)
      let offset = 1
      if (title.length > 0 && url && url.length > 0) {
        offset = 4 + title.length + url.length
      } else if (title.length > 0 && (!url || url.length === 0)) {
        offset = 3 + title.length
      }

      if (type === 'image') {
        offset++
      }

      return {
        changes: { from, to, insert: `${pre}[${title}](${url})` },
        range: EditorSelection.cursor(from + offset),
      }
    })

    target.dispatch(transaction)
  }

  if (clipboardRead) {
    clipboardRead()
      .then(({ text }) => insertWithText(text))
      .catch(() => insertWithText(''))
  } else {
    insertWithText('')
  }

  return true
}

function removeBlockMarkup(line: string): string {
  let match
  if ((match = /^#{1,6}\s+/.exec(line)) !== null) {
    return line.substring(match[0].length)
  } else if ((match = /^(\s{,3})>\s/.exec(line)) !== null) {
    return match[1] + line.substring(match[0].length)
  }
  return line
}

function applyBlockMarkup(target: EditorView, formatting: string): void {
  const transaction = target.state.changeByRange((range) => {
    const startLine = target.state.doc.lineAt(range.from).number
    const endLine = target.state.doc.lineAt(range.to).number

    const changes: ChangeSpec[] = []
    let caret = range.to

    for (let i = startLine; i <= endLine; i++) {
      const line = target.state.doc.line(i)
      const withoutBlocks = removeBlockMarkup(line.text)
      changes.push({ from: line.from, to: line.to, insert: formatting + ' ' + withoutBlocks })
      // The line grew by the marker; the caret has to land after the new text, not where
      // the old one ended.
      if (i === endLine) caret = line.from + formatting.length + 1 + withoutBlocks.length
    }

    return { changes, range: EditorSelection.cursor(caret) }
  })

  target.dispatch(transaction)
}

function applyInlineMarkup(target: EditorView, start: string, end: string): void {
  const transaction = target.state.changeByRange((range) => {
    const contents = target.state.sliceDoc(range.from, range.to)
    const before = target.state.sliceDoc(range.from - start.length, range.from)
    const after = target.state.sliceDoc(range.to, range.to + end.length)

    if (before === start && after === end) {
      return {
        changes: {
          from: range.from - start.length,
          to: range.to + end.length,
          insert: contents,
        },
        range: EditorSelection.range(
          range.from - start.length,
          range.from - start.length + contents.length,
        ),
      }
    } else if (contents.startsWith(start) && contents.endsWith(end)) {
      return {
        changes: {
          from: range.from,
          to: range.to,
          insert: contents.substring(start.length, contents.length - end.length),
        },
        range: EditorSelection.range(
          range.from,
          range.from + contents.length - start.length - end.length,
        ),
      }
    } else if (after === end && range.empty) {
      return { range: EditorSelection.cursor(range.to + end.length) }
    } else {
      return {
        changes: { from: range.from, to: range.to, insert: start + contents + end },
        range: EditorSelection.range(
          range.from + start.length,
          range.from + start.length + contents.length,
        ),
      }
    }
  })

  target.dispatch(transaction)
}

function applyList(target: EditorView, type: 'ul' | 'ol' | 'task'): void {
  const transaction = target.state.changeByRange((range) => {
    const startLine = target.state.doc.lineAt(range.from).number
    const endLine = target.state.doc.lineAt(range.to).number

    const changes: ChangeSpec[] = []
    let offsetCharacters = 0

    for (let i = startLine; i <= endLine; i++) {
      const line = target.state.doc.line(i)
      const withoutBlocks = removeBlockMarkup(line.text)
      const formatting = type === 'ol' ? `${i - startLine + 1}.` : type === 'ul' ? '*' : '- [ ]'
      offsetCharacters += line.text.length - withoutBlocks.length + formatting.length + 1
      changes.push({ from: line.from, to: line.to, insert: formatting + ' ' + withoutBlocks })
    }

    return { changes, range: EditorSelection.cursor(range.to + offsetCharacters) }
  })

  target.dispatch(transaction)
}

export function applyBold(target: EditorView): boolean {
  applyInlineMarkup(target, '**', '**')
  return true
}

export function applyItalic(target: EditorView): boolean {
  applyInlineMarkup(target, '*', '*')
  return true
}

export function applyCode(target: EditorView): boolean {
  applyInlineMarkup(target, '`', '`')
  return true
}

export function applyHeading(target: EditorView, level: number): boolean {
  applyBlockMarkup(target, '#'.repeat(Math.min(6, Math.max(1, level))))
  return true
}

export function applyH1(target: EditorView): boolean {
  return applyHeading(target, 1)
}

export function applyH2(target: EditorView): boolean {
  applyBlockMarkup(target, '##')
  return true
}

export function applyH3(target: EditorView): boolean {
  applyBlockMarkup(target, '###')
  return true
}

/** The file keeps the Markdown form; the preview expands it for display. */
export function applyHighlight(target: EditorView): boolean {
  applyInlineMarkup(target, '==', '==')
  return true
}

export function applyUnderline(target: EditorView): boolean {
  applyInlineMarkup(target, '<u>', '</u>')
  return true
}

/** Markdown has no line break inside a paragraph; <br> is the portable form. */
export function insertLineBreak(target: EditorView): boolean {
  const { state } = target
  const selection = state.selection.main
  target.dispatch({
    changes: { from: selection.from, to: selection.to, insert: '<br>\n' },
    selection: EditorSelection.cursor(selection.from + 5),
  })
  return true
}

export function applyHorizontalRule(target: EditorView): boolean {
  const { state } = target
  const line = state.doc.lineAt(state.selection.main.from)
  const at = line.to
  // Right after the current line, not two lines further down.
  target.dispatch({
    changes: { from: at, insert: '\n\n---' },
    selection: EditorSelection.cursor(at + 6),
  })
  return true
}

export function insertTable(target: EditorView, columns: number, rows: number): boolean {
  const cols = Math.min(12, Math.max(1, columns))
  const body = Math.min(20, Math.max(1, rows))
  const header = `| ${Array.from({ length: cols }, (_, index) => `Column ${index + 1}`).join(' | ')} |`
  const divider = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`
  const empty = `| ${Array.from({ length: cols }, () => '   ').join(' | ')} |`
  const table = [header, divider, ...Array.from({ length: body }, () => empty)].join('\n')
  const { state } = target
  const line = state.doc.lineAt(state.selection.main.from)
  target.dispatch({ changes: { from: line.to, insert: `\n\n${table}\n` } })
  return true
}

export function insertDate(target: EditorView, format = 'yyyy-MM-dd'): boolean {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const text = format
    .replace('yyyy', String(now.getFullYear()))
    .replace('MM', pad(now.getMonth() + 1))
    .replace('dd', pad(now.getDate()))
  const { state } = target
  const selection = state.selection.main
  target.dispatch({
    changes: { from: selection.from, to: selection.to, insert: text },
    selection: { anchor: selection.from + text.length },
  })
  return true
}

export function applyStrikethrough(target: EditorView): boolean {
  applyInlineMarkup(target, '~~', '~~')
  return true
}

export function applyBlockquote(target: EditorView): boolean {
  applyBlockMarkup(target, '>')
  return true
}

export function applyBulletList(target: EditorView): boolean {
  applyList(target, 'ul')
  return true
}

export function applyOrderedList(target: EditorView): boolean {
  applyList(target, 'ol')
  return true
}

export function applyTaskList(target: EditorView): boolean {
  applyList(target, 'task')
  return true
}

export function insertLink(target: EditorView, clipboardRead?: ClipboardReadFunction): boolean {
  return insertLinkOrImage(target, 'link', clipboardRead)
}

export function insertImage(target: EditorView, clipboardRead?: ClipboardReadFunction): boolean {
  return insertLinkOrImage(target, 'image', clipboardRead)
}

