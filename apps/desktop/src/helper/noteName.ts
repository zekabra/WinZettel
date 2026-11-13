import { NOTE_EXTENSIONS } from './noteCounts'

/**
 * The single rule for how a note is named on screen.
 *
 * Every surface — tree, tabs, search, quick open, favourites, rename field — asks here, so
 * a new list cannot silently start showing extensions again. The file on disk always keeps
 * its extension; only the label loses it.
 */
export const stripNoteExtension = (name: string): string => {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return name
  const ext = name.slice(dot + 1).toLowerCase()
  return NOTE_EXTENSIONS.has(ext) ? name.slice(0, dot) : name
}

/** The extension a rename or a save must keep. */
export const noteExtensionOf = (name: string): string | undefined => {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return undefined
  const ext = name.slice(dot + 1)
  return NOTE_EXTENSIONS.has(ext.toLowerCase()) ? ext : undefined
}
