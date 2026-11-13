import { TooltipProvider } from '@/components/ui/tooltip'
import { EditorViewType, type EditorViewTypeValue } from '@/constants/editorViewType'
import bus from '@/helper/eventBus'
import type { IShowContextMenuParams } from '@/stores/useContextMenuStore'
import useEditorViewTypeStore from '@/stores/useEditorViewTypeStore'
import { desktopDarkTheme } from '@markflowy/theme'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { enableMapSet } from 'immer'
import { ThemeProvider } from 'styled-components'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PreviewToolbar } from './PreviewToolbar/PreviewToolbar'
import { SourceCodeToolbar } from './SourceCodeToolbar/SourceCodeToolbar'
import { ViewSwitcher } from './components/ViewSwitcher'

const mocks = vi.hoisted(() => ({
  showMenu: vi.fn<(params: IShowContextMenuParams) => void>(),
  supportedModes: ['sourceCode', 'preview'],
}))

vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/helper/eventBus', () => ({ default: { emit: vi.fn() } }))
vi.mock('@/helper/files', () => ({ getFileObject: (id: string) => ({ id, name: `${id}.md` }) }))
vi.mock('@/stores', () => ({
  useEditorStore: (selector: (state: { activeId: string }) => unknown) =>
    selector({ activeId: 'other' }),
}))
vi.mock('@/stores/useFileTypeConfigStore', () => ({
  default: {
    getState: () => ({
      getFileTypeConfigById: () => ({ supportedModes: mocks.supportedModes }),
    }),
  },
}))
vi.mock('@/components/ui-v2/ContextMenu', () => ({ showContextMenu: mocks.showMenu }))
vi.mock('./sourceCodeEditorRegistry', () => ({ getSourceCodeEditor: () => undefined }))
vi.mock('../sourceInsertCommands', () => ({ insertSourceImage: vi.fn(), insertSourceLink: vi.fn() }))
vi.mock('./components/MenuList', () => ({ MenuList: () => <button type='button'>More</button> }))

enableMapSet()
beforeEach(() => {
  vi.clearAllMocks()
  mocks.supportedModes = ['sourceCode', 'preview']
  useEditorViewTypeStore.setState({ editorViewTypeMap: new Map(), editorGroupViewTypeMap: new Map() })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function withProviders(children: React.ReactNode) {
  return (
    <ThemeProvider theme={desktopDarkTheme}>
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  )
}

describe('editor view switcher', () => {
  it('shows one button per supported mode and switches on click', () => {
    useEditorViewTypeStore.getState().setEditorViewType('pane', EditorViewType.SOURCECODE)
    mocks.supportedModes = ['sourceCode']
    const { rerender } = render(withProviders(<ViewSwitcher editorId='pane' groupId='right' />))

    // only the modes the file type supports are on screen
    expect(screen.queryByRole('button', { name: 'view.preview' })).toBeNull()
    const sourceButton = screen.getByRole('button', { name: 'view.source_code' })
    expect(sourceButton.getAttribute('aria-pressed')).toBe('true')

    mocks.supportedModes = ['sourceCode', 'preview']
    rerender(withProviders(<ViewSwitcher editorId='pane' groupId='right' />))

    // preview comes first, then source code
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(buttons).toEqual(['view.preview', 'view.source_code'])

    const previewButton = screen.getByRole('button', { name: 'view.preview' })
    expect(previewButton.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(previewButton)
    expect(bus.emit).toHaveBeenCalledWith('editor_toggle_type', undefined, EditorViewType.PREVIEW, {
      editorId: 'pane',
      groupId: 'right',
    })
    expect(mocks.showMenu).not.toHaveBeenCalled()
  })



  it.each([
    [EditorViewType.SOURCECODE, 'view.source_code', SourceCodeToolbar],
    [EditorViewType.PREVIEW, 'view.preview', PreviewToolbar],
  ] as const)('keeps the %s switcher visible when the toolbar is narrower than its common controls', async (mode, label, Toolbar) => {
    useEditorViewTypeStore.getState().setEditorViewType('pane', mode as EditorViewTypeValue)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
      DOMRect.fromRect({ width: 40, height: 32 }),
    )
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.sectionId === 'common' ? 48 : 90
    })
    const { container } = render(withProviders(<Toolbar editorId='pane' groupId='right' />))
    const button = screen.getByRole('button', { name: label })
    const common = button.closest('[data-section-id="common"]')!

    if (mode !== EditorViewType.PREVIEW) {
      await waitFor(() => expect(getComputedStyle(container.querySelector('[data-section-id="history"]')!).display).toBe('none'))
    }
    expect(getComputedStyle(common).display).not.toBe('none')
    expect(common.contains(button)).toBe(true)
    fireEvent.click(button)
    expect(bus.emit).toHaveBeenCalledWith('editor_toggle_type', undefined, mode, {
      editorId: 'pane',
      groupId: 'right',
    })
  })
})
