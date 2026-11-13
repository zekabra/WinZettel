import { getFileObject, getFileObjectByPath } from '@/helper/files'
import { createFile } from '@/helper/filesys'
import { useEditorStateStore, useEditorStore } from '@/stores'
import { i18n } from '@/i18n'
import { EditorViewType } from '@/constants/editorViewType'
import useEditorViewTypeStore from '@/stores/useEditorViewTypeStore'
import { savePathCoordinator } from '@/components/EditorArea/savePathCoordinator'
import { isPristineDocument, markPristineDocument } from './pristine-document'
import { getMarkdownDefaultMode } from '@/helper/fileTypeHandler'
import useAppSettingStore from '@/stores/useAppSettingStore'

export function ensureDocument() {
  const editor = useEditorStore.getState()
  if (editor.getRootPath() || editor.opened.length) return
  const file = createFile({ name: `${i18n.t('file.untitled')}.md`, content: '' })
  // A brand new document has nothing to read, so it always starts editable.
  useEditorViewTypeStore.getState().setEditorViewType(file.id, EditorViewType.SOURCECODE)
  markPristineDocument(file.id)
  useEditorStateStore.getState().setIdStateMap(file.id, { hasUnsavedChanges: false })
  editor.addOpenedFile(file.id)
  editor.setActiveId(file.id)
}

export function removePristineDocuments() {
  for (const id of useEditorStore.getState().opened) {
    if (isPristineDocument(id) && !getFileObject(id)?.path) {
      useEditorStore.getState().delOpenedFile(id)
    }
  }
}

interface AddNewMarkdownFileEditParams {
  fileName: string
  content: string
}

export const addNewMarkdownFileEdit = async (params: AddNewMarkdownFileEditParams) => {
  // Programmatic content (for example Ask exports) must wait for an update snapshot's barrier.
  // Existing-file opens can already own the workspace queue, so only new drafts enter it here.
  await savePathCoordinator.runFileMutation(() => addMarkdownFileEdit(params))
}

interface AddExistingMarkdownFileEditParams {
  fileName: string
  content?: string
  path: string
  ext?: string
}

export const addExistingMarkdownFileEdit = async (params: AddExistingMarkdownFileEditParams) => {
  await addMarkdownFileEdit(params)
}

interface AddMarkdownFileEditParams {
  fileName: string
  content?: string
  path?: string
  ext?: string
}

export const addMarkdownFileEdit = async (params: AddMarkdownFileEditParams) => {
  removePristineDocuments()
  const existing = params.path ? getFileObjectByPath(params.path) : undefined
  if (existing) {
    const editor = useEditorStore.getState()
    const group = editor.getActiveGroup()
    if (group) editor.openFileInGroup(group.id, existing.id, { mode: 'permanent' })
    return
  }
  const { fileName } = params
  const newFile = createFile({
    name: fileName,
    ...params,
  })
  const { addOpenedFile, setActiveId } = useEditorStore.getState()
  const { setIdStateMap } = useEditorStateStore.getState()

  addOpenedFile(newFile.id)
  setActiveId(newFile.id)
  // A new note starts in the mode chosen in Settings → Editor.
  if (!params.path && (newFile.ext || '').toLowerCase() === 'md') {
    useEditorViewTypeStore
      .getState()
      .setEditorViewType(
        newFile.id,
        getMarkdownDefaultMode(useAppSettingStore.getState().settingData.md_editor_default_mode),
      )
  }
  if (params.path) {
    const state = {
      hasUnsavedChanges: false,
      undoDepth: 0,
    }
    setIdStateMap(newFile.id, state)
  } else {
    setIdStateMap(newFile.id, {
      hasUnsavedChanges: true,
    })
  }
}

export const addEmptyEditorTab = async () => {
  const empty = createFile({
    name: i18n.t('file.newTab'),
    content: '',
    path: undefined,
    kind: 'new_tab',
  })
  const { addOpenedFile, setActiveId } = useEditorStore.getState()
  const { setIdStateMap } = useEditorStateStore.getState()

  addOpenedFile(empty.id)
  setActiveId(empty.id)
  setIdStateMap(empty.id, {
    hasUnsavedChanges: false,
  })
}

export const isEmptyEditor = (id?: string): boolean => {
  if (!id) return false
  const file = getFileObject(id)
  if (!file) return false
  return file.kind === 'new_tab'
}
