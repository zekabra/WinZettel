import { create } from 'zustand'
import type { IFile } from '@/helper/filesys'
import { isEditableFile } from '@/helper/fileTypeHandler'

/**
 * Exact per-folder note counts.
 *
 * The tree only holds the children of folders that were opened, so counting from it reports
 * 0 for everything closed. This index reads each directory once, in the background, so the
 * numbers are right from the first paint and do not jump as folders open.
 *
 * `byPath` holds branch totals (a folder counts its own notes and those of its subfolders),
 * which is what the tree shows.
 */
interface NoteCountState {
  byPath: Map<string, number>
  total: number
  status: 'idle' | 'indexing' | 'ready'
  revision: number
  reset: () => void
  beginIndex: (revision: number) => void
  finishIndex: (revision: number, byPath: Map<string, number>, total: number) => void
}

const useNoteCountsStore = create<NoteCountState>((set) => ({
  byPath: new Map(),
  total: 0,
  status: 'idle',
  revision: 0,
  reset: () => set({ byPath: new Map(), total: 0, status: 'idle', revision: 0 }),
  // Keeps the previous numbers on screen while a new pass runs: they only change when the
  // workspace itself changed, never because a folder was opened.
  beginIndex: (revision) => set({ status: 'indexing', revision }),
  finishIndex: (revision, byPath, total) =>
    set((state) => (state.revision === revision ? { status: 'ready', byPath, total } : state)),
}))

/** A file counts when the app can open it for editing, the same rule the tree uses. */
const isNote = (file: IFile): boolean => {
  if (file.kind !== 'file') return false
  return isEditableFile(file.name)
}

const separator = (path: string): string => (path.includes('\\') ? '\\' : '/')

const isDescendant = (candidate: string, parent: string): boolean =>
  candidate.startsWith(`${parent}${separator(parent)}`)

/**
 * Reads every directory under `rootPath` and returns branch totals plus the workspace total.
 * A few directories at a time, and it stops quietly when the workspace changed underneath it.
 */
export const indexNoteCounts = async (
  rootPath: string,
  readSubdirectory: (path: string) => Promise<IFile[]>,
  isStale: () => boolean,
): Promise<{ byPath: Map<string, number>; total: number }> => {
  const direct = new Map<string, number>()
  const folders: string[] = []
  const queue: string[] = [rootPath]
  const visited = new Set<string>([rootPath.toLowerCase()])
  const CONCURRENCY = 4

  while (queue.length > 0) {
    if (isStale()) break
    const batch = queue.splice(0, CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (folderPath) => {
        try {
          return { folderPath, children: await readSubdirectory(folderPath) }
        } catch {
          return { folderPath, children: [] as IFile[] }
        }
      }),
    )

    for (const { folderPath, children } of results) {
      const key = folderPath.toLowerCase()
      folders.push(key)
      let count = 0
      for (const child of children) {
        if (child.kind === 'dir') {
          const path = child.path
          if (path && !visited.has(path.toLowerCase())) {
            visited.add(path.toLowerCase())
            queue.push(path)
          }
        } else if (isNote(child)) {
          count += 1
        }
      }
      direct.set(key, count)
    }
  }

  const total = [...direct.values()].reduce((sum, count) => sum + count, 0)
  const byPath = new Map<string, number>()
  for (const folder of folders) {
    let sum = direct.get(folder) ?? 0
    for (const [other, count] of direct) {
      if (other !== folder && isDescendant(other, folder)) sum += count
    }
    byPath.set(folder, sum)
  }

  return { byPath, total }
}

export default useNoteCountsStore
