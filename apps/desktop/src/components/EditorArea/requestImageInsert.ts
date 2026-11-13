import { isImagePath } from '@/helper/fileTypeHandler'
import { logger } from '@/helper/logger'
import { dialog } from '@/services/dialog'
import {
  handleInsertLocalImage,
  type InsertedImageAttributes,
} from './imageHandlers'

/**
 * A picked attachment is embedded when the preview can render it as an image and
 * linked otherwise, so the picker may offer every file type.
 */
export type ImageInsertOutcome =
  | { kind: 'image'; attributes: InsertedImageAttributes }
  | { kind: 'link'; href: string; text: string }

const fileNameOf = (path: string): string => path.split(/[\\/]/).pop() || path

const nameWithoutExtension = (path: string): string => {
  const name = fileNameOf(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export const requestImageInsert = async (
  fileId?: string,
): Promise<ImageInsertOutcome | null> => {
  const selection = await dialog.imageInsert()
  if (!selection) return null

  if (selection.type === 'url') {
    return { kind: 'image', attributes: { src: selection.url } }
  }

  try {
    const attributes = await handleInsertLocalImage(selection.path, fileId)
    if (!isImagePath(selection.path)) {
      return {
        kind: 'link',
        href: attributes.src,
        text: attributes.alt || nameWithoutExtension(selection.path),
      }
    }
    return { kind: 'image', attributes }
  } catch (error) {
    logger.error('Failed to insert local image:', error)
    return null
  }
}
