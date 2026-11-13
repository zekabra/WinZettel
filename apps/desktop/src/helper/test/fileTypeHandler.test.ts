import { EditorViewType } from '@/constants/editorViewType'
import { describe, expect, it } from 'vitest'
import {
  getFileTypeConfig,
  getMarkdownDefaultMode,
  getMarkdownSupportedModes,
  isTextfileType,
} from '../fileTypeHandler'

describe('document preview file types', () => {
  it.each(['page.html', 'page.HTM'])('opens %s in preview with editable source', async (name) => {
    const config = await getFileTypeConfig({ id: name, name, kind: 'file' })
    expect(config).toEqual({
      type: 'html',
      defaultMode: EditorViewType.PREVIEW,
      supportedModes: [EditorViewType.PREVIEW, EditorViewType.SOURCECODE],
    })
    expect(isTextfileType(config)).toBe(true)
  })
  it('keeps PDF bytes out of text editing and saving', async () => {
    const config = await getFileTypeConfig({ id: 'pdf', name: 'report.PDF', kind: 'file' })
    expect(config).toEqual({
      type: 'pdf',
      defaultMode: EditorViewType.PREVIEW,
      supportedModes: [EditorViewType.PREVIEW],
    })
    expect(isTextfileType(config)).toBe(false)
  })
})

describe('getMarkdownSupportedModes', () => {
  it('offers Preview and Source Code for Markdown', () => {
    expect(getMarkdownSupportedModes()).toEqual([EditorViewType.PREVIEW, EditorViewType.SOURCECODE])
  })

  it('falls back to Preview when a saved mode is unavailable', () => {
    expect(getMarkdownDefaultMode('wysiwyg')).toBe(EditorViewType.PREVIEW)
    expect(getMarkdownSupportedModes()).toContain(EditorViewType.PREVIEW)
  })

  it('keeps valid preferences and defaults to Preview', () => {
    expect(getMarkdownDefaultMode(EditorViewType.PREVIEW)).toBe(EditorViewType.PREVIEW)
    expect(getMarkdownDefaultMode('unknown-mode')).toBe(EditorViewType.PREVIEW)
  })

  it('keeps Source Code and Preview preferences', () => {
    expect(getMarkdownDefaultMode(EditorViewType.SOURCECODE)).toBe(EditorViewType.SOURCECODE)
    expect(getMarkdownDefaultMode(EditorViewType.PREVIEW)).toBe(EditorViewType.PREVIEW)
  })
})
