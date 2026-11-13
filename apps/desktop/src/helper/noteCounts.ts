import type { IFile } from '@/helper/filesys'
import { isEditableFile } from './fileTypeHandler'

/**
 * Every file the app can open for editing counts: markdown, HTML, JSON, text and code.
 * Images, PDFs and binaries are attachments, so a folder's number means "files I can edit
 * here" — which is what the owner expects from it.
 */
/**
 * Markdown-family extensions. Used where a file has to be treated as a *note* rather than a
 * generic editable file: stripping extensions from labels and the per-note encryption scan.
 * Counting uses `isEditableFile` instead.
 */
export const NOTE_EXTENSIONS = new Set(['md', 'markdown', 'mdx', 'txt'])

const isNoteFile = (file: IFile): boolean => {
  if (file.kind !== 'file') return false
  return isEditableFile(file.name)
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
