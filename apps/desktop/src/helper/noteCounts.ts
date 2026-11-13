import type { IFile } from '@/helper/filesys'

/**
 * What counts as a note: the Markdown files the app edits, plus plain text notes. Images,
 * PDFs and other attachments are left out, so a folder's number means "notes", not "files".
 */
export const NOTE_EXTENSIONS = new Set(['md', 'markdown', 'mdx', 'txt'])

const isNoteFile = (file: IFile): boolean => {
  if (file.kind !== 'file') return false
  const ext = file.ext?.toLowerCase()
  if (ext) return NOTE_EXTENSIONS.has(ext)
  return NOTE_EXTENSIONS.has((file.name.split('.').pop() ?? '').toLowerCase())
}

export { stripNoteExtension } from './noteName'

/** Every note under these files, recursively, together with a per-folder total. */
export const collectNoteCounts = (
  files: readonly IFile[],
): { total: number; byPath: Map<string, number> } => {
  const byPath = new Map<string, number>()

  const walk = (nodes: readonly IFile[]): number => {
    let total = 0
    for (const node of nodes) {
      if (node.kind === 'dir') {
        const count = walk(node.children ?? [])
        if (node.path) byPath.set(node.path.toLowerCase(), count)
        total += count
      } else if (isNoteFile(node)) {
        total += 1
      }
    }
    return total
  }

  return { total: walk(files), byPath }
}

/** The notes inside one folder, as file objects, for actions that work on a whole folder. */
export const collectNotesIn = (folder: IFile): IFile[] => {
  const notes: IFile[] = []
  const walk = (nodes: readonly IFile[]) => {
    for (const node of nodes) {
      if (node.kind === 'dir') walk(node.children ?? [])
      else if (isNoteFile(node)) notes.push(node)
    }
  }
  walk(folder.children ?? [])
  return notes
}
