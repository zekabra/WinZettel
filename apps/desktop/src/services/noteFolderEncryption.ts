import { i18n } from '@/i18n'
import { toast } from 'zens'
import { logger } from '@/helper/logger'
import { dialog } from '@/services/dialog'
import { encryptNoteFile } from '@/services/note-encryption'
import { collectNotesIn } from '@/helper/noteCounts'
import { useEditorStore } from '@/stores'
import useNoteEncryptionStore from '@/stores/useNoteEncryptionStore'
import type { IFile } from '@/helper/filesys'
import { NOTE_EXTENSIONS } from '@/helper/noteCounts'

let readFolder: ((path: string) => Promise<IFile[]>) | undefined

/** Installed by the file-system adapter, so a folder can be read without expanding it. */
export const setFolderReader = (reader: (path: string) => Promise<IFile[]>): void => {
  readFolder = reader
}

const isNoteFile = (file: IFile): boolean => {
  if (file.kind !== 'file') return false
  const ext = (file.ext ?? file.name.split('.').pop() ?? '').toLowerCase()
  return NOTE_EXTENSIONS.has(ext)
}

/** Every note under a folder, read from disk rather than from the loaded tree. */
const collectNotesFromDisk = async (folderPath: string): Promise<IFile[]> => {
  if (!readFolder) return []
  const notes: IFile[] = []
  const visited = new Set<string>([folderPath.toLowerCase()])
  const queue: string[] = [folderPath]

  while (queue.length > 0) {
    const current = queue.shift() as string
    let children: IFile[] = []
    try {
      children = await readFolder(current)
    } catch (error) {
      logger.error(error)
      continue
    }
    for (const child of children) {
      if (child.kind === 'dir') {
        const path = child.path
        if (path && !visited.has(path.toLowerCase())) {
          visited.add(path.toLowerCase())
          queue.push(path)
        }
      } else if (isNoteFile(child)) {
        notes.push(child)
      }
    }
  }

  return notes
}

const isEncryptedOnDisk = async (path: string): Promise<boolean> => {
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    return await invoke<boolean>('note_file_is_encrypted', { filePath: path })
  } catch (error) {
    logger.error(error)
    // Without an answer, assume it is encrypted: skipping is recoverable, encrypting twice
    // is not.
    return true
  }
}

/**
 * Encrypts every note under a folder, using the passphrase from Settings.
 *
 * Asking first matters: a stray click would otherwise encrypt a whole folder, and undoing it
 * means decrypting note by note. Notes that already carry the marker are skipped, so running
 * it twice is harmless — that is also what the summary reports.
 */
export const encryptNotesInFolder = async (folderPath: string): Promise<void> => {
  const fromDisk = readFolder ? await collectNotesFromDisk(folderPath) : []
  const folder = findFolderByPath(folderPath)
  const notes = fromDisk.length > 0 ? fromDisk : folder ? collectNotesIn(folder) : []
  if (notes.length === 0) {
    toast.info(i18n.t('contextmenu.explorer.encrypt_folder_empty'))
    return
  }

  const pending: IFile[] = []
  for (const note of notes) {
    if (!note.path) continue
    if (await isEncryptedOnDisk(note.path)) continue
    pending.push(note)
  }

  const skipped = notes.length - pending.length
  if (pending.length === 0) {
    toast.info(i18n.t('contextmenu.explorer.encrypt_folder_all_done', { skipped }))
    return
  }

  const answer = await dialog.confirm({
    title: i18n.t('contextmenu.explorer.encrypt_folder_title'),
    content: i18n.t('contextmenu.explorer.encrypt_folder_confirm', {
      folder: folderName(folderPath),
      count: pending.length,
      skipped,
    }),
    actions: [
      { id: 'cancel', label: i18n.t('common.cancel') },
      { id: 'confirm', label: i18n.t('contextmenu.explorer.encrypt_folder'), primary: true },
    ],
  })
  if (answer !== 'confirm') return

  let encrypted = 0
  let failed = 0
  for (const note of pending) {
    const path = note.path
    if (!path) continue
    // Lock before writing: an open editor would otherwise save the plaintext back.
    useNoteEncryptionStore.getState().markEncrypted(path)
    useNoteEncryptionStore.getState().lock(path)
    try {
      await encryptNoteFile(path)
      encrypted += 1
    } catch (error) {
      logger.error(error)
      useNoteEncryptionStore.getState().markDecrypted(path)
      useNoteEncryptionStore.getState().unlock(path)
      failed += 1
    }
  }

  if (failed > 0) {
    toast.error(
      i18n.t('contextmenu.explorer.encrypt_folder_summary_failed', {
        encrypted,
        failed,
        skipped,
      }),
    )
    return
  }
  toast.success(
    i18n.t('contextmenu.explorer.encrypt_folder_summary', { encrypted, skipped }),
  )
}

const folderName = (folderPath: string): string =>
  folderPath.split(/[\\/]/).filter(Boolean).pop() ?? folderPath

const findFolderByPath = (folderPath: string): IFile | undefined => {
  const target = folderPath.toLowerCase()
  const search = (nodes: readonly IFile[]): IFile | undefined => {
    for (const node of nodes) {
      if (node.kind !== 'dir') continue
      if (node.path?.toLowerCase() === target) return node
      const found = search(node.children ?? [])
      if (found) return found
    }
    return undefined
  }
  return search(useEditorStore.getState().folderData ?? [])
}
