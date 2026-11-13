import {
  captureEditorCommandTarget,
  executeEditorPaletteCommand,
  releaseEditorCommandTarget,
} from '@/extensions/command-palette/editorCommands'
import { createCommandMap } from '@markflowy/interface'
import type { MfCodemirrorView } from 'rme'
import type { DesktopMenuItemData } from '@/stores/useContextMenuStore'

const commands = createCommandMap()

export interface EditorContextMenuTitles {
  headings: string
  text: string
  code: string
  headingLevels: string[]
  bold: string
  italic: string
  underline: string
  strike: string
  highlight: string
  inlineCode: string
  codeBlock: string
  mathBlock: string
}

interface EditorContextActionsParams {
  view: MfCodemirrorView
  fileId: string
  groupId?: string
  titles: EditorContextMenuTitles
}

/**
 * The three toolbar menus worth having at the caret: headings, inline formatting and code.
 * Lower-value entries (link, image, table, lists) stay on the toolbar; the menu only keeps
 * what is quicker to reach than moving the pointer to the top of the window.
 *
 * They run the same commands as the toolbar rather than reimplementing them, so a change in
 * one place stays a change in both. Only the source pane builds this menu.
 */
export const buildEditorContextItems = ({
  view,
  fileId,
  groupId,
  titles,
}: EditorContextActionsParams): DesktopMenuItemData[] => {
  const run = (name: string, attrs?: Record<string, unknown>) => () => {
    const command = commands[name]
    if (!command) return
    command(view.cm, attrs)
    view.cm.focus()
  }

  const runBlock = (command: 'editor_insertCodeBlock' | 'editor_insertMathBlock') => () => {
    const target = captureEditorCommandTarget({ fileId, groupId })
    void executeEditorPaletteCommand(target, command).finally(() =>
      releaseEditorCommandTarget(target),
    )
  }

  return [
    {
      value: 'heading',
      label: titles.headings,
      children: titles.headingLevels.map((label, index) => ({
        value: `heading-${index + 1}`,
        label,
        handler: run('toggleHeading', { level: index + 1 }),
      })),
    },
    {
      value: 'text',
      label: titles.text,
      children: [
        { value: 'bold', label: titles.bold, handler: run('toggleStrong') },
        { value: 'italic', label: titles.italic, handler: run('toggleEmphasis') },
        { value: 'underline', label: titles.underline, handler: run('toggleUnderline') },
        { value: 'strike', label: titles.strike, handler: run('toggleDelete') },
        { value: 'highlight', label: titles.highlight, handler: run('setHighlight') },
      ],
    },
    {
      value: 'code',
      label: titles.code,
      children: [
        { value: 'inline-code', label: titles.inlineCode, handler: run('toggleCodeText') },
        { value: 'code-block', label: titles.codeBlock, handler: runBlock('editor_insertCodeBlock') },
        { value: 'math-block', label: titles.mathBlock, handler: runBlock('editor_insertMathBlock') },
      ],
    },
    { type: 'divider' },
  ]
}
