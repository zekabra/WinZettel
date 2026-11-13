import { act, cleanup, render, screen } from '@testing-library/react'
import { desktopLightTheme } from '@markflowy/theme'
import { enableMapSet } from 'immer'
import type { PropsWithChildren } from 'react'
import { ThemeProvider } from 'styled-components'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createFile } from '@/helper/filesys'
import useEditorStore from '@/stores/useEditorStore'
import useEditorStateStore from '@/stores/useEditorStateStore'
import EditorAreaContent from './EditorAreaContent'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }))
vi.mock('@/hooks', () => ({
  useGlobalOSInfo: () => ({ osType: 'windows' }),
  useOpen: () => ({ openFolderDialog: vi.fn() }),
}))
vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  t: (key: string) => key,
  i18n: { t: (key: string) => key },
}))
vi.mock('react-resizable-panels', () => {
  const Box = ({ children, className }: PropsWithChildren<{ className?: string }>) => (
    <div className={className}>{children}</div>
  )
  return { Group: Box, Panel: Box, Separator: () => null }
})
vi.mock('./Editor', () => ({
  default: () => <div data-testid='editor' />,
}))
vi.mock('./ExternalFileChangeAlert', () => ({ ExternalFileChangeAlert: () => null }))
vi.mock('./editorToolBar/FindReplace', () => ({ FindReplace: () => null }))
vi.mock('./editorToolBar/PreviewToolbar/PreviewToolbar', () => ({ PreviewToolbar: () => null }))
vi.mock('./editorToolBar/SourceCodeToolbar/SourceCodeToolbar', () => ({
  SourceCodeToolbar: () => null,
}))
vi.mock('@/components/LocalHistory/DraftProtectionStatus', () => ({
  DraftProtectionStatus: () => null,
}))

enableMapSet()

beforeEach(() => {
  useEditorStore.getState().setFolderData(null)
  useEditorStateStore.setState({ idStateMap: new Map() })
  createFile({ id: 'document', name: 'My note.md', path: '/notes/My note.md' })
  useEditorStore
    .getState()
    .setEditorLayout(
      { type: 'leaf', id: 'group', opened: ['document'], activeId: 'document' },
      'group',
    )
})
afterEach(cleanup)

it('survives closing the last tab', () => {
  render(
    <ThemeProvider theme={desktopLightTheme}>
      <TooltipProvider>
        <EditorAreaContent />
      </TooltipProvider>
    </ThemeProvider>,
  )

  expect(screen.getByTestId('editor')).toBeTruthy()

  act(() => {
    useEditorStore.getState().closeFileInGroup('group', 'document')
  })

  // Nothing to show, but the area must still render: no error boundary, no throw.
  expect(screen.queryByTestId('editor')).toBeNull()
  expect(useEditorStore.getState().getGroup('group')?.opened).toEqual([])
})
