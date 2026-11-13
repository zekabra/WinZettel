import type { EditorViewType as RmeEditorViewType } from 'rme'

// Persisted mode identifiers must remain available without evaluating the RME bundle.
export const EditorViewType = {
  SOURCECODE: 'sourceCode' as RmeEditorViewType.SOURCECODE,
  PREVIEW: 'preview' as RmeEditorViewType.PREVIEW,
} as const

export type EditorViewTypeValue = (typeof EditorViewType)[keyof typeof EditorViewType]

export interface EditorViewTarget {
  editorId: string
  groupId?: string
}

/** Modes that render the document as Markdown text rather than as a reader surface. */
export function isEditableView(viewType: EditorViewTypeValue | undefined): boolean {
  return viewType === EditorViewType.SOURCECODE
}
