import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { IFile } from '@/helper/filesys'
import type { IShowContextMenuParams } from '@/stores/useContextMenuStore'
import { fileSaveCoordinator } from '../../fileSaveCoordinator'
import { DEFAULT_TEXT_METADATA } from '../../textFileFormat'
import { MenuList } from './MenuList'
import { commandRegistry } from '@/commands'
import bus from '@/helper/eventBus'
import type * as EditorViewTypeStore from '@/stores/useEditorViewTypeStore'
import type { Bookmark } from '@/extensions/bookmarks/types'

const mocks = vi.hoisted(() => ({
  showMenu: vi.fn<(params: IShowContextMenuParams) => void>(),
  save: vi.fn(),
  findBookmark: vi.fn<(path: string) => Bookmark | undefined>(),
  files: {
    pane: { id: 'pane', name: 'pane.md', path: '/pane.md', kind: 'file', ext: 'md' },
    other: { id: 'other', name: 'other.md', path: '/other.md', kind: 'file', ext: 'md' },
    image: { id: 'image', name: 'photo.png', path: '/photo.png', kind: 'file', ext: 'png' },
    start: { id: 'start', name: 'New tab', kind: 'new_tab' },
    draft: { id: 'draft', name: 'Untitled.md', kind: 'file', ext: 'md' },
  } as Record<string, Partial<IFile>>,
}))

vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/commands', () => ({ commandRegistry: { execute: vi.fn() } }))
vi.mock('@/components/LocalHistory/historyDialogStore', () => ({ openLocalHistory: vi.fn() }))
vi.mock('@/components/ui-v2/ContextMenu', () => ({ showContextMenu: mocks.showMenu }))
vi.mock('@/helper/eventBus', () => ({ default: { emit: vi.fn() } }))
vi.mock('@/helper/files', () => ({
  default: (selector: (state: { entries: typeof mocks.files }) => unknown) =>
    selector({ entries: mocks.files }),
  getFileObject: (id: string) => mocks.files[id],
}))
vi.mock('@/stores', () => ({
  useEditorStore: (
    selector: (state: { activeId: string; getEditorContent: () => string }) => unknown,
  ) => selector({ activeId: 'other', getEditorContent: () => '' }),
  useEditorStateStore: (selector: (state: { idStateMap: Map<string, unknown> }) => unknown) =>
    selector({ idStateMap: new Map() }),
}))
vi.mock('@/stores/useAppSettingStore', () => ({
  default: (selector: (state: { settingData: Record<string, unknown> }) => unknown) =>
    selector({ settingData: {} }),
}))
vi.mock('@/stores/useEditorViewTypeStore', async (importOriginal) => ({
  ...(await importOriginal<typeof EditorViewTypeStore>()),
  default: (selector: (state: { editorViewTypeMap: Map<string, string>; editorGroupViewTypeMap: Map<string, Map<string, string>> }) => unknown) =>
    selector({ editorViewTypeMap: new Map(), editorGroupViewTypeMap: new Map() }),
}))
vi.mock('@/stores/useFileTypeConfigStore', () => ({
  default: {
    getState: () => ({
      getFileTypeConfigById: (id: string) => ({
        type: id === 'image' ? 'image' : 'markdown',
        supportedModes: ['sourceCode', 'preview'],
      }),
    }),
  },
}))
vi.mock('@/extensions/bookmarks/store', () => ({
  useBookmarkStore: { getState: () => ({ findBookmark: mocks.findBookmark }) },
}))
vi.mock('@/services/dialog', () => ({ dialog: { info: vi.fn() } }))
vi.mock('@/services/text-file-format', () => ({
  previewFileEncoding: vi.fn(),
  applyEncodingPreview: vi.fn(),
  saveFileWithFormat: mocks.save,
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ size: '1 KB', last_modified: '' }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.save.mockResolvedValue(true)
  mocks.findBookmark.mockReset()
  fileSaveCoordinator.loadSnapshot('pane', {
    content: 'text',
    revision: 'disk',
    status: 'success',
    text: { ...DEFAULT_TEXT_METADATA, format: { encoding: 'gbk', bom: 'none' } },
  })
})
afterEach(cleanup)

function openMenu(editorId: string, value = 'text_encoding') {
  render(
    <TooltipProvider>
      <MenuList editorId={editorId} />
    </TooltipProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'action.more' }))
  return mocks.showMenu.mock.calls.at(-1)![0].items.find(
    (item) => 'value' in item && item.value === value,
  )
}

describe('toolbar bookmarks', () => {
  it('edits the bookmark belonging to this pane using the new target model', () => {
    const bookmark: Bookmark = {
      id: 'bookmark-pane',
      title: 'My notes',
      target: { kind: 'localFile', path: '/pane.md' },
      tags: ['work'],
      createdAt: 100,
    }
    mocks.findBookmark.mockImplementation((path) => path === '/pane.md' ? bookmark : undefined)

    const item = openMenu('pane', 'BookMark')
    expect(mocks.findBookmark).toHaveBeenCalledWith('/pane.md')
    expect(item).toMatchObject({ checked: true })
    if (!item || !('handler' in item)) throw new Error('Bookmark action missing')
    act(() => item.handler?.())
    expect(commandRegistry.execute).toHaveBeenCalledWith('edit_bookmark_dialog', bookmark)
  })

  it('offers creation for an unbookmarked target without using the active pane', () => {
    const item = openMenu('pane', 'BookMark')
    expect(item).toMatchObject({ checked: false })
    if (!item || !('handler' in item)) throw new Error('Bookmark action missing')
    act(() => item.handler?.())
    expect(commandRegistry.execute).toHaveBeenCalledWith('open_bookmark_dialog', mocks.files.pane)
  })
})

describe('toolbar file encoding', () => {
  it('shows and saves the toolbar document encoding when another pane is globally active', async () => {
    const item = openMenu('pane')
    expect(item).toMatchObject({ label: 'text_encoding.label · GBK' })

    act(() => {
      if (item && 'handler' in item) item.handler?.()
    })
    expect(screen.getByRole('dialog', { name: 'text_encoding.label' })).toBeTruthy()
    expect(screen.getByText(/pane\.md · GBK/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'text_encoding.save_with_encoding' }))

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith('pane', {
        encoding: 'gbk',
        bom: 'none',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it.each(['image', 'start'])('omits encoding actions for a non-text tab: %s', (editorId) => {
    expect(openMenu(editorId)).toBeUndefined()
  })
})

it('retains the originating pane when a More-menu view command is selected', () => {
  render(<TooltipProvider><MenuList editorId='pane' groupId='right' /></TooltipProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'action.more' }))
  const viewMenu = mocks.showMenu.mock.calls.at(-1)![0].items.find(
    (item) => 'value' in item && item.value === 'view_switcher',
  )
  if (!viewMenu || !('children' in viewMenu)) throw new Error('View menu missing')
  const sourceItem = viewMenu.children?.find((item) => 'value' in item && item.value === 'sourceCode')
  if (!sourceItem || !('handler' in sourceItem)) throw new Error('Source command missing')
  act(() => sourceItem.handler?.())
  expect(bus.emit).toHaveBeenCalledWith('editor_toggle_type', undefined, 'sourceCode', {
    editorId: 'pane', groupId: 'right',
  })
})

it('offers window zoom commands in the existing View submenu', async () => {
  const viewMenu = openMenu('pane', 'view_switcher')
  if (!viewMenu || !('children' in viewMenu)) throw new Error('View menu missing')
  vi.mocked(commandRegistry.execute).mockResolvedValue(undefined)
  for (const command of ['app_zoomIn', 'app_zoomOut', 'app_zoomReset']) {
    const item = viewMenu.children?.find((entry) => 'value' in entry && entry.value === command)
    if (!item || !('handler' in item)) throw new Error(`Zoom command missing: ${command}`)
    await act(async () => item.handler?.())
    expect(commandRegistry.execute).toHaveBeenCalledWith(command)
  }
})
