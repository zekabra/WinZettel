import { invoke } from '@tauri-apps/api/core'
import { FileResultCode, type FileSysResult } from '@/helper/filesys'
import useRepoStore from '@/stores/useRepoStore'

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  pdf: 'application/pdf',
}

const normalize = (value: string) =>
  value.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')

const mimeFor = (path: string): string => {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

/**
 * A `data:` URL for an image that lives inside the open encrypted repository.
 *
 * The webview cannot load these files through `asset:`, because on disk they are ciphertext.
 * Returns `null` for anything outside the repository, so ordinary folders keep using the
 * existing file-source path untouched.
 */
export async function repoAssetUrlIfInside(path: string): Promise<string | null> {
  const { isUnlocked, root } = useRepoStore.getState()
  if (!isUnlocked || !root || !path) return null

  const target = normalize(path)
  const base = normalize(root)
  if (target !== base && !target.startsWith(`${base}/`)) return null

  try {
    const result = await invoke<FileSysResult>('read_u8_array_from_file', { filePath: path })
    if (result.code !== FileResultCode.Success) return null
    return `data:${mimeFor(path)};base64,${result.content}`
  } catch {
    return null
  }
}
