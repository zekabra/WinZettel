import { useEditorStore } from '@/stores'
import { EditorViewType } from '@/constants/editorViewType'
import useEditorViewTypeStore, { selectEditorViewType } from '@/stores/useEditorViewTypeStore'
import { type FC, useCallback, useMemo } from 'react'
import { useTranslation } from '@/i18n'
import {
  captureEditorCommandTarget,
  executeEditorPaletteCommand,
  releaseEditorCommandTarget,
} from '@/extensions/command-palette/editorCommands'
import { logger } from '@/helper/logger'
import {
  BoldIcon,
  Code2Icon,
  CalendarIcon,
  CornerDownLeftIcon,
  Heading1Icon,
  MinusIcon,
  TableIcon,
  FolderOpenIcon,
  LinkIcon,
  ListIcon,
  SearchIcon,
  QuoteIcon,
  Redo2Icon,
  Undo2Icon,
} from 'lucide-react'
import {
  ToolbarSection,
  usePriorityHidden,
  ToolbarWrapper,
  ToolbarDivider,
  createCommandMap,
} from '@markflowy/interface'
import {
  getOverflowToolbarActions,
  MenuList,
  ToolbarActionButton,
  toOverflowMenuItems,
  type ToolbarAction,
} from '../components'
import { getSourceCodeEditor } from '../../sourceCodeEditorRegistry'
import { openDocumentSearch } from '../../editorSearchStore'
import { insertSourceImage, insertSourceLink } from '../../sourceInsertCommands'
import { LinkInsertPopover } from '../components/LinkInsertPopover'
import { TableInsertPopover } from '../components/TableInsertPopover'
import { ViewSwitcher } from '../components/ViewSwitcher'

interface SourceCodeToolbarProps {
  editorId?: string
  groupId?: string
}

const TOOLBAR_GROUPS = [
  { id: 'history', priority: 90 },
  { id: 'headings', priority: 60 },
  { id: 'formatting', priority: 50 },
  { id: 'insert', priority: 40 },
  { id: 'blocks', priority: 30 },
]

const TOOLBAR_SECTIONS = [{ id: 'common', priority: 100 }, ...TOOLBAR_GROUPS]

const sourceCommandMap = createCommandMap()

export const SourceCodeToolbar: FC<SourceCodeToolbarProps> = (props) => {
  const { editorId, groupId } = props
  const activeId = useEditorStore((state) => state.activeId)
  const { t } = useTranslation()
  const targetEditorId = editorId ?? activeId
  const imageLabel = t('toolbar.image') || 'Image'

  const viewType = useEditorViewTypeStore((state) =>
    selectEditorViewType(state, targetEditorId ?? '', groupId),
  )

  const { containerRef, hiddenIds, registerItemWidth } = usePriorityHidden({
    items: TOOLBAR_SECTIONS,
    gap: 0,
  })

  const getEditorView = useCallback(() => {
    if (!targetEditorId) return undefined
    return getSourceCodeEditor(targetEditorId, groupId)?.cm
  }, [targetEditorId, groupId])

  const runBlockCommand = useCallback(
    (command: 'editor_insertCodeBlock' | 'editor_insertMathBlock') => {
      if (!targetEditorId) return
      const target = captureEditorCommandTarget({ fileId: targetEditorId, groupId })
      void executeEditorPaletteCommand(target, command)
        .catch((error) => logger.error('Block insertion failed', error))
        .finally(() => releaseEditorCommandTarget(target))
    },
    [groupId, targetEditorId],
  )

  const runSourceCommand = useCallback(
    (commandName: string, attrs?: Record<string, unknown>) => {
      const view = getEditorView()
      if (!view) return
      const command = sourceCommandMap[commandName]
      if (!command) return

      command(view, attrs)
      view.focus()
    },
    [getEditorView],
  )

  const handleInsertImage = useCallback(async () => {
    const view = getEditorView()
    if (view) await insertSourceImage(view, targetEditorId, undefined, groupId)
  }, [getEditorView, targetEditorId, groupId])

  const handleInsertLink = useCallback(async () => {
    const view = getEditorView()
    if (view) await insertSourceLink(view, targetEditorId, undefined, groupId)
  }, [getEditorView, targetEditorId, groupId])

  const actions = useMemo<ToolbarAction[]>(
    () => [
      {
        id: 'undo',
        group: 'history',
        priority: 90,
        label: t('toolbar.undo') || 'Undo',
        icon: Undo2Icon,
        run: () => runSourceCommand('undo'),
      },
      {
        id: 'redo',
        group: 'history',
        priority: 90,
        label: t('toolbar.redo') || 'Redo',
        icon: Redo2Icon,
        run: () => runSourceCommand('redo'),
      },
      {
        id: 'headings',
        group: 'headings',
        priority: 60,
        label: t('toolbar.headings') || 'Heading',
        icon: Heading1Icon,
        items: [1, 2, 3, 4, 5, 6].map((level) => ({
          id: `heading-${level}`,
          label: t(`toolbar.h${level}`) || `Heading ${level}`,
          run: () => runSourceCommand('toggleHeading', { level }),
        })),
      },
      {
        id: 'formatting',
        group: 'formatting',
        priority: 50,
        label: t('toolbar.formatting') || 'Text',
        icon: BoldIcon,
        items: [
          { id: 'bold', label: t('toolbar.bold') || 'Bold', run: () => runSourceCommand('toggleStrong') },
          { id: 'italic', label: t('toolbar.italic') || 'Italic', run: () => runSourceCommand('toggleEmphasis') },
          { id: 'underline', label: t('toolbar.underline') || 'Underline', run: () => runSourceCommand('toggleUnderline') },
          { id: 'strike', label: t('toolbar.strike') || 'Strikethrough', run: () => runSourceCommand('toggleDelete') },
          { id: 'highlight', label: t('toolbar.highlight') || 'Highlight', run: () => runSourceCommand('setHighlight') },
        ],
      },
      {
        id: 'link',
        group: 'insert',
        priority: 40,
        label: t('toolbar.link') || 'Link',
        icon: LinkIcon,
        render: () => <LinkInsertPopover editorId={targetEditorId} />,
      },
      {
        id: 'image',
        group: 'insert',
        priority: 40,
        label: imageLabel,
        icon: FolderOpenIcon,
        run: () => void handleInsertImage(),
      },
      {
        id: 'table',
        group: 'insert',
        priority: 38,
        label: t('toolbar.table') || 'Table',
        icon: TableIcon,
        render: () => <TableInsertPopover editorId={targetEditorId} />,
      },
      {
        id: 'horizontal-rule',
        group: 'insert',
        priority: 36,
        label: t('toolbar.hr') || 'Horizontal rule',
        icon: MinusIcon,
        run: () => runSourceCommand('insertHorizontalRule'),
      },
      {
        id: 'line-break',
        group: 'insert',
        priority: 35,
        label: t('toolbar.line_break') || 'Line break',
        icon: CornerDownLeftIcon,
        run: () => runSourceCommand('insertLineBreak'),
      },
      {
        id: 'date',
        group: 'insert',
        priority: 34,
        label: t('toolbar.date') || 'Date',
        icon: CalendarIcon,
        run: () => runSourceCommand('insertDate'),
      },
      {
        id: 'code',
        group: 'formatting',
        priority: 48,
        label: t('toolbar.code') || 'Code',
        icon: Code2Icon,
        items: [
          { id: 'inline-code', label: t('toolbar.inline_code') || 'Inline code', run: () => runSourceCommand('toggleCodeText') },
          { id: 'code-block', label: t('toolbar.codeBlock') || 'Code block', run: () => runBlockCommand('editor_insertCodeBlock') },
          { id: 'math-block', label: t('toolbar.mathBlock') || 'Math block', run: () => runBlockCommand('editor_insertMathBlock') },
        ],
      },
      {
        id: 'blockquote',
        group: 'blocks',
        priority: 30,
        label: t('toolbar.quote') || 'Blockquote',
        icon: QuoteIcon,
        run: () => runSourceCommand('toggleBlockquote'),
      },
      {
        id: 'lists',
        group: 'blocks',
        priority: 30,
        label: t('toolbar.lists') || 'Lists',
        icon: ListIcon,
        items: [
          { id: 'bullet-list', label: t('toolbar.bulletList') || 'Bullet list', run: () => runSourceCommand('toggleBulletList') },
          { id: 'ordered-list', label: t('toolbar.orderedList') || 'Ordered list', run: () => runSourceCommand('toggleOrderedList') },
          { id: 'task-list', label: t('toolbar.taskList') || 'Task list', run: () => runSourceCommand('toggleTaskList') },
        ],
      },
      {
        id: 'find',
        group: 'blocks',
        priority: 40,
        label: t('find_replace.open') || 'Find in document',
        icon: SearchIcon,
        run: () => void openDocumentSearch(),
      },
    ],
    [handleInsertImage, handleInsertLink, imageLabel, runBlockCommand, runSourceCommand, t],
  )

  const overflowMenuItems = useMemo(
    () => toOverflowMenuItems(getOverflowToolbarActions(actions, hiddenIds)),
    [actions, hiddenIds],
  )

  if (viewType !== EditorViewType.SOURCECODE) {
    return null
  }

  return (
    <ToolbarWrapper className='mf-editor-toolbar' ref={containerRef}>
      <ToolbarSection id='common' registerWidth={registerItemWidth} hidden={false}>
        <ViewSwitcher editorId={targetEditorId} groupId={groupId} />
        <MenuList
          editorId={targetEditorId}
          groupId={groupId}
          prependItems={overflowMenuItems}
        />
      </ToolbarSection>

      {TOOLBAR_GROUPS.map((group) => (
        <ToolbarSection
          hidden={hiddenIds.has(group.id)}
          id={group.id}
          key={group.id}
          registerWidth={registerItemWidth}
        >
          <ToolbarDivider />
          {actions
            .filter((action) => action.group === group.id)
            .map((action) => (
              <ToolbarActionButton action={action} key={action.id} />
            ))}
        </ToolbarSection>
      ))}
    </ToolbarWrapper>
  )
}
