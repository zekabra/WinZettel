import { invoke } from '@tauri-apps/api/core'
import type { IFile } from '@/helper/filesys'
import { NOTE_EXTENSIONS } from '@/helper/noteCounts'
import { logger } from '@/helper/logger'
import useNoteEncryptionStore from '@/stores/useNoteEncryptionStore'

/**
 * Which notes are encrypted, decided at startup.
 *
 * Waiting for a click to reveal a lock is late: the tree would show a plain page for a note
 * the user cannot read. So the workspace is walked once, every note file is asked for its
 * marker (its first bytes, never its content), and the tree paints the truth from the start.
 *
 * Every note type the app edits is included — the marker is a text prefix, not a Markdown
 * feature, so `.txt` notes encrypted by the phone carry it too.
 */
const CONCURRENCY = 8

const isNoteFile = (file: IFile): boolean => {
  if (file.kind !== 'file') return false
  const ext = (file.ext ?? file.name.split('.').pop() ?? '').toLowerCase()
  return NOTE_EXTENSIONS.has(ext)
}

const isEncryptedOnDisk = async (path: string): Promise<boolean | undefined> => {
  try {
    return await invoke<boolean>('note_file_is_encrypted', { filePath: path })
  } catch (error) {
    logger.error(error)
    return undefined
  }
}

interface ScanResult {
  notes: number
  encrypted: number
}

export const scanNoteEncryption = async (
  rootPath: string,
  readSubdirectory: (path: string) => Promise<IFile[]>,
  isStale: () => boolean,
): Promise<ScanResult> => {
  const notePaths: string[] = []
  const queue: string[] = [rootPath]
  const visited = new Set<string>([rootPath.toLowerCase()])

  while (queue.length > 0) {
    if (isStale()) return { notes: 0, encrypted: 0 }
    const batch = queue.splice(0, CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (folderPath) => {
        try {
          return await readSubdirectory(folderPath)
        } catch {
          return [] as IFile[]
        }
      }),
    )

    for (const children of results) {
      for (const child of children) {
        if (child.kind === 'dir') {
          const path = child.path
          if (path && !visited.has(path.toLowerCase())) {
            visited.add(path.toLowerCase())
            queue.push(path)
          }
        } else if (isNoteFile(child) && child.path) {
          notePaths.push(child.path)
        }
      }
    }
  }

  const store = useNoteEncryptionStore.getState()
  let encrypted = 0
  for (let index = 0; index < notePaths.length; index += CONCURRENCY) {
    if (isStale()) break
    const slice = notePaths.slice(index, index + CONCURRENCY)
    const answers = await Promise.all(slice.map((path) => isEncryptedOnDisk(path)))
    answers.forEach((answer, offset) => {
      if (answer === undefined) return
      const path = slice[offset]
      if (answer) {
        encrypted += 1
        store.markEncrypted(path)
      } else {
        store.markDecrypted(path)
      }
    })
  }

  return { notes: notePaths.length, encrypted }
}
