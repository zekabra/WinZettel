import { isCurrentCommandTarget, type EditorCommandTarget } from './editorCommandTarget'
import { getSourceCodeEditor } from '@/components/EditorArea/sourceCodeEditorRegistry'
import { insertSourceBlock, insertSourceImage, insertSourceLink } from '@/components/EditorArea/sourceInsertCommands'
import { EditorViewType } from '@/constants/editorViewType'
import useFileTypeConfigStore from '@/stores/useFileTypeConfigStore'
import { redoDepth, undoDepth } from '@codemirror/commands'
import { Transaction } from '@codemirror/state'
import { createCommandMap } from '@markflowy/interface'

export {
  captureEditorCommandTarget,
  releaseEditorCommandTarget,
  isCurrentCommandTarget,
  type EditorCommandTarget,
} from './editorCommandTarget'

export type CommandUnavailableReason =
  | 'no_document'
  | 'unavailable'
  | 'preview'
  | 'read_only'
  | 'stale_target'
  | 'no_undo'
  | 'no_redo'
  | 'markdown_only'
  | 'zen_mode'

export const EDITOR_COMMANDS = [
  ['editor_undo', 'undo'],
  ['editor_redo', 'redo'],
  ['editor_toggleStrong', 'bold'],
  ['editor_toggleEmphasis', 'italic'],
  ['editor_toggleCodeText', 'code'],
  ['editor_toggleH1', 'h1'],
  ['editor_toggleH2', 'h2'],
  ['editor_toggleH3', 'h3'],
  ['editor_toggleBlockquote', 'quote'],
  ['editor_toggleBulletList', 'bulletList'],
  ['editor_toggleOrderedList', 'orderedList'],
  ['editor_toggleTaskList', 'taskList'],
  ['editor_insertLink', 'link'],
  ['editor_insertImage', 'image'],
  ['editor_insertCodeBlock', 'codeBlock'],
  ['editor_insertMathBlock', 'mathBlock'],
  ['editor_toggleDelete', 'strike'],
] as const
export type EditorPaletteCommand = (typeof EDITOR_COMMANDS)[number][0]

const sourceCommands = createCommandMap()

function sourceCommandUnavailable(
  target: EditorCommandTarget,
  command: EditorPaletteCommand,
): CommandUnavailableReason | undefined {
  const { source, sourceState, fileId } = target
  if (!source || !sourceState) return 'unavailable'
  if (
    getSourceCodeEditor(fileId, target.resourceGroupId)?.cm !== source ||
    source.state.doc !== sourceState.doc
  )
    return 'stale_target'
  if (source.state.readOnly) return 'read_only'
  if (command === 'editor_undo' && !undoDepth(source.state)) return 'no_undo'
  if (command === 'editor_redo' && !redoDepth(source.state)) return 'no_redo'
}

export function editorCommandUnavailable(
  target: EditorCommandTarget | null,
  command: EditorPaletteCommand,
): CommandUnavailableReason | undefined {
  if (!target) return 'no_document'
  if (!isCurrentCommandTarget(target)) return 'stale_target'
  if (target.mode === EditorViewType.PREVIEW) return 'preview'
  const { fileId } = target
  const reason = sourceCommandUnavailable(target, command)
  if (reason) return reason
  if (
    !['editor_undo', 'editor_redo'].includes(command) &&
    useFileTypeConfigStore.getState().getFileTypeConfigById(fileId)?.type !== 'markdown'
  )
    return 'markdown_only'
  return undefined
}

export function restoreEditorCommandTarget(target: EditorCommandTarget): boolean {
  if (!isCurrentCommandTarget(target)) return false
  const { source, sourceState, fileId } = target
  if (
    source &&
    sourceState &&
    getSourceCodeEditor(fileId, target.resourceGroupId)?.cm === source &&
    source.state.doc === sourceState.doc &&
    !source.state.readOnly
  ) {
    source.focus()
    source.dispatch({
      selection: sourceState.selection,
      annotations: Transaction.addToHistory.of(false),
    })
    return true
  }
  return false
}

export async function executeEditorPaletteCommand(
  target: EditorCommandTarget | null,
  command: EditorPaletteCommand,
) {
  if (!target || editorCommandUnavailable(target, command)) return false
  const { source, fileId } = target
  if (!source) return false
  // Restore the captured selection so the command formats the text the palette
  // showed, even after the user moved the caret while the palette was open.
  if (!restoreEditorCommandTarget(target)) return false
  const isCurrent = () => !editorCommandUnavailable(target, command)
  if (command === 'editor_insertLink') return insertSourceLink(source, fileId, isCurrent)
  if (command === 'editor_insertImage') return insertSourceImage(source, fileId, isCurrent)
  if (command === 'editor_insertCodeBlock') return insertSourceBlock(source, 'code')
  if (command === 'editor_insertMathBlock') return insertSourceBlock(source, 'math')
  if (/^editor_toggleH[123]$/.test(command))
    return sourceCommands.toggleHeading(source, { level: Number(command.at(-1)) })
  return sourceCommands[command.replace('editor_', '')]?.(source) ?? false
}
