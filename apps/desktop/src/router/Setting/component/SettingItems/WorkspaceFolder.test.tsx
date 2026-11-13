import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openFolderDialog: vi.fn(),
  rootPath: '/home/martin/Notas' as string | undefined,
}))

vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks', () => ({ useOpen: () => ({ openFolderDialog: mocks.openFolderDialog }) }))
vi.mock('@/stores/useEditorStore', () => ({
  default: (selector: (state: { folderData?: { path: string }[] }) => unknown) =>
    selector(mocks.rootPath ? { folderData: [{ path: mocks.rootPath }] } : {}),
}))

import WorkspaceFolderSettingItem from './WorkspaceFolder'

const item: Setting.WorkspaceFolderSettingItem = {
  key: 'workspace_folder',
  type: 'workspace_folder',
  title: { i18nKey: 'settings.general.workspace.folder.label' },
  desc: { i18nKey: 'settings.general.workspace.folder.desc' },
}

beforeEach(() => {
  mocks.rootPath = '/home/martin/Notas'
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('workspace folder setting', () => {
  it('shows the folder this window currently has open', () => {
    render(<WorkspaceFolderSettingItem item={item} />)

    expect(screen.getByText('/home/martin/Notas')).toBeTruthy()
    expect(screen.getByText('settings.general.workspace.folder.label')).toBeTruthy()
  })

  it('says so when no folder is open', () => {
    mocks.rootPath = undefined
    render(<WorkspaceFolderSettingItem item={item} />)

    expect(screen.getByText('settings.general.workspace.folder.empty')).toBeTruthy()
  })

  it('opens the folder picker when the user asks to change it', () => {
    render(<WorkspaceFolderSettingItem item={item} />)

    fireEvent.click(screen.getByRole('button'))

    expect(mocks.openFolderDialog).toHaveBeenCalledOnce()
  })
})
