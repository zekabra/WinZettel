import { getSourceCodeEditor } from '@/components/EditorArea/sourceCodeEditorInstances'
import { EditorViewType, type EditorViewTypeValue } from '@/constants/editorViewType'
import useEditorStore from '@/stores/useEditorStore'
import useEditorViewTypeStore from '@/stores/useEditorViewTypeStore'
import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

export interface EditorCommandTarget {
  fileId: string
  groupId?: string
  /** Explicit toolbar pane; undefined retains the active editor compatibility registry. */
  resourceGroupId?: string
  mode: EditorViewTypeValue
  source?: EditorView
  sourceState?: EditorState
}

export function captureEditorCommandTarget(pane?: { fileId: string; groupId?: string }): EditorCommandTarget | null {
  const { activeId, activeGroupId } = useEditorStore.getState()
  const fileId = pane?.fileId ?? activeId
  const groupId = pane?.groupId ?? activeGroupId
  if (!fileId) return null
  const mode = useEditorViewTypeStore.getState().getEditorViewType(fileId, groupId)
  const resourceGroupId = pane?.groupId
  const source =
    mode === EditorViewType.SOURCECODE ? getSourceCodeEditor(fileId, resourceGroupId)?.cm : undefined
  return {
    fileId,
    groupId,
    resourceGroupId,
    mode,
    source,
    sourceState: source?.state,
  }
}

/** Retained for the palette's session lifecycle; no editor-owned selection lease remains. */
export function releaseEditorCommandTarget(target: EditorCommandTarget | null) {
  // Command targets only borrow CodeMirror view identity, so nothing is leased.
  void target
}

export function isCurrentCommandTarget(target: EditorCommandTarget): boolean {
  const { activeId, activeGroupId } = useEditorStore.getState()
  return (
    activeId === target.fileId &&
    activeGroupId === target.groupId &&
    useEditorViewTypeStore.getState().getEditorViewType(target.fileId, target.groupId) === target.mode
  )
}
