import React, { useCallback } from 'react'
import { MfIconButton } from '../Button/icon-button'
import { redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import {
  applyBold,
  applyItalic,
  applyCode,
  applyHeading,
  applyUnderline,
  applyHighlight,
  applyHorizontalRule,
  insertLineBreak,
  insertTable,
  insertDate,
  applyStrikethrough,
  applyBlockquote,
  applyBulletList,
  applyOrderedList,
  applyTaskList,
  insertLink,
  insertImage,
  type ClipboardReadFunction,
} from './markdownCommands'

type CommandFunction = (view: EditorView, attrs?: any, clipboardRead?: ClipboardReadFunction) => boolean

export interface CodeCommandButtonProps {
  commandName: string
  icon: string
  label: string
  attrs?: Record<string, any>
  disabled?: boolean
  getEditorView: () => EditorView | undefined
  clipboardRead?: ClipboardReadFunction
}

export const createCommandMap = (clipboardRead?: ClipboardReadFunction): Record<string, CommandFunction> => ({
  undo: (view) => {
    undo(view)
    return true
  },
  redo: (view) => {
    redo(view)
    return true
  },
  toggleHeading: (view, attrs) => {
    const level = Number(attrs?.level)
    if (Number.isInteger(level) && level >= 1 && level <= 6) return applyHeading(view, level)
    return false
  },
  setHighlight: (view) => applyHighlight(view),
  toggleUnderline: (view) => applyUnderline(view),
  insertHorizontalRule: (view) => applyHorizontalRule(view),
  insertLineBreak: (view) => insertLineBreak(view),
  insertTable: (view, attrs) =>
    insertTable(view, Number(attrs?.columns ?? 3), Number(attrs?.rows ?? 3)),
  insertDate: (view, attrs) => insertDate(view, String(attrs?.format ?? 'yyyy-MM-dd')),
  toggleStrong: applyBold,
  toggleEmphasis: applyItalic,
  toggleCodeText: applyCode,
  toggleBlockquote: applyBlockquote,
  toggleBulletList: applyBulletList,
  toggleOrderedList: applyOrderedList,
  toggleTaskList: applyTaskList,
  toggleDelete: applyStrikethrough,
  insertLink: (view) => insertLink(view, clipboardRead),
  insertImage: (view) => insertImage(view, clipboardRead),
})

export const CodeCommandButton: React.FC<CodeCommandButtonProps> = ({
  commandName,
  icon,
  label,
  attrs,
  disabled,
  getEditorView,
  clipboardRead,
}) => {
  const handleClick = useCallback(() => {
    const view = getEditorView()
    if (!view) return

    const commandMap = createCommandMap(clipboardRead)
    const command = commandMap[commandName]
    if (command) {
      command(view, attrs)
      view.focus()
    }
  }, [getEditorView, commandName, attrs, clipboardRead])

  return (
    <MfIconButton
      icon={icon}
      onClick={handleClick}
      tooltipProps={{ title: label }}
      disabled={disabled}
      size="small"
      rounded="smooth"
    />
  )
}
