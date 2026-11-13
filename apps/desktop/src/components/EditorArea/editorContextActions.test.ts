import { describe, expect, it, vi } from 'vitest'
import type { MfCodemirrorView } from 'rme'
import { buildEditorContextItems, type EditorContextMenuTitles } from './editorContextActions'

vi.mock('./sourceInsertCommands', () => ({
  insertSourceImage: vi.fn(),
  insertSourceLink: vi.fn(),
}))

const titles: EditorContextMenuTitles = {
  headings: 'Heading',
  text: 'Text',
  code: 'Code',
  headingLevels: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'],
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough',
  highlight: 'Highlight',
  inlineCode: 'Inline code',
  codeBlock: 'Code block',
  mathBlock: 'Math block',
}

const view = { cm: { focus: vi.fn() } } as unknown as MfCodemirrorView

describe('editor context actions', () => {
  const items = buildEditorContextItems({
    view,
    fileId: 'note',
    groupId: 'left',
    titles,
  })

  it('offers the three menus worth reaching at the caret', () => {
    const labels = items
      .filter((item) => 'children' in item)
      .map((item) => ('label' in item ? item.label : ''))
    expect(labels).toEqual(['Heading', 'Text', 'Code'])
    expect(items.some((item) => 'label' in item && item.label === 'Link')).toBe(false)
  })

  it('offers all six heading levels', () => {
    const headings = items[0]
    if (!('children' in headings) || !headings.children) throw new Error('missing headings')
    expect(headings.children).toHaveLength(6)
  })

  it('ends with a divider so the clipboard actions stay separate', () => {
    expect(items.at(-1)).toEqual({ type: 'divider' })
  })
})
