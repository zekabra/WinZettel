import { createCommandMap } from '@markflowy/interface'
import { getSourceCodeEditor } from '../../sourceCodeEditorRegistry'

const commands = createCommandMap()

/** Runs one of the markdown toolbar commands against a specific editor. */
export const executeSourceCommand = (
  editorId: string | undefined,
  name: string,
  attrs?: Record<string, unknown>,
): boolean => {
  const editor = editorId ? getSourceCodeEditor(editorId) : undefined
  if (!editor) return false
  const command = commands[name]
  if (!command) return false
  const ran = command(editor.cm, attrs)
  editor.cm.focus()
  return ran
}
