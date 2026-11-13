import { describe, expect, it } from 'vitest'
import { EditorViewType as RmeEditorViewType } from 'rme'
import { EditorViewType } from './editorViewType'

describe('persisted editor mode identifiers', () => {
  it('keeps the lightweight host identifiers compatible with the workspace editor', () => {
    for (const [mode, value] of Object.entries(EditorViewType)) {
      expect(RmeEditorViewType[mode as keyof typeof RmeEditorViewType]).toBe(value)
    }
    expect(Object.keys(EditorViewType).sort()).toEqual(['PREVIEW', 'SOURCECODE'])
  })
})
