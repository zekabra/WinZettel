import NiceModal from '@ebay/nice-modal-react'
import { invoke } from '@tauri-apps/api/core'
import { MODAL_REPO_UNLOCK_ID } from '@/constants/modals'
import { i18n } from '@/i18n'
import { getFileNameFromPath } from '@/helper/filesys'
import { toast } from 'zens'
import useRepoStore from '@/stores/useRepoStore'

export interface RepoStatus {
  isRepo: boolean
  isUnlocked: boolean
  root?: string | null
  creator?: string | null
}

export const readRepoStatus = (path: string) => invoke<RepoStatus>('repo_status', { path })

export const unlockRepo = (path: string, password: string) =>
  invoke<RepoStatus>('repo_unlock', { path, password })

const lockRepoBackend = () => invoke<boolean>('repo_lock')

export interface CreateRepoInput {
  path: string
  password: string
  plaintextNames: boolean
  cipher: 'auto' | 'aes' | 'xchacha'
  logN: 14 | 16 | 18
}

/** Create a repository with the same options the Android app offers. */
export const createRepo = async (input: CreateRepoInput) => {
  const status = await invoke<RepoStatus>('repo_create', {
    path: input.path,
    password: input.password,
    plaintextNames: input.plaintextNames,
    cipher: input.cipher,
    logN: input.logN,
  })
  useRepoStore.getState().setUnlocked(input.path)
  return status
}

/**
 * Close every open document that lives inside a repository, before its key is dropped.
 *
 * Leaving a tab open over a locked volume is what made the window refuse to close: the editor
 * kept a document it could no longer save.
 */
const closeDocumentsUnder = async (root: string | null) => {
  if (!root) return
  const [{ default: useEditorStore }, { getFileObject }] = await Promise.all([
    import('@/stores/useEditorStore'),
    import('@/helper/files'),
  ])
  const prefix = root.replace(/\\/g, '/').toLowerCase()
  const editor = useEditorStore.getState()
  const layout = editor.editorLayout
  const groups: { id: string; opened: string[] }[] = []
  const walk = (node: typeof layout) => {
    if (node.type === 'leaf') {
      groups.push({ id: node.id, opened: node.opened })
      return
    }
    node.children.forEach(walk)
  }
  walk(layout)

  for (const group of groups) {
    for (const fileId of group.opened) {
      const file = getFileObject(fileId)
      const path = file?.path?.replace(/\\/g, '/').toLowerCase()
      if (path && path.startsWith(prefix)) editor.closeFileInGroup(group.id, fileId)
    }
  }
}

export const lockRepo = async () => {
  await closeDocumentsUnder(useRepoStore.getState().root)
  const done = await lockRepoBackend()
  useRepoStore.getState().clear()
  return done
}

const identity = (path: string) => path.replace(/\\/g, '/').toLowerCase()

/**
 * Unlock the repository in `path`, if it is one, before the workspace opens.
 *
 * Only one repository can be open at a time, so switching to another one locks the previous
 * one: the owner is told, because a repository that silently stays readable would be worse
 * than the interruption.
 */
/**
 * Leaving a repository for a plain folder locks the volume and clears the UI state.
 *
 * Without this the app would keep a repository key in memory and keep showing its settings
 * as unavailable while a normal folder is open.
 */
export async function releaseRepositoryForPlainFolder(path: string): Promise<void> {
  const root = useRepoStore.getState().root
  if (!root) return
  const identity = (value: string) => value.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '')
  if (identity(root) === identity(path)) return
  await lockRepo().catch(() => undefined)
}

export async function ensureRepoUnlocked(path: string): Promise<boolean> {
  // A folder that cannot be inspected is opened normally: the repository check must never be
  // the reason a workspace fails to open.
  let status: RepoStatus | null = null
  try {
    status = await readRepoStatus(path)
  } catch {
    return true
  }
  if (!status || status.isRepo !== true) {
    // A plain folder: the previous repository must not stay unlocked in the background.
    await releaseRepositoryForPlainFolder(path)
    return true
  }
  if (status.isUnlocked === true) return true

  const previous = status.root
  const unlocked = await NiceModal.show<boolean>(MODAL_REPO_UNLOCK_ID, {
    path,
    folderName: getFileNameFromPath(path) || path,
  })
  if (!unlocked) return false

  useRepoStore.getState().setUnlocked(path)

  if (previous && identity(previous) !== identity(path)) {
    toast.info(i18n.t('repo.unlock.previous_locked'))
  }
  return true
}
