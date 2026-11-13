import { invoke } from "@tauri-apps/api/core"
import { logger } from "./logger"

export const clipboardRead = async () => {
  let html = '',
    text = ''

  try {
    html = await invoke<string>('get_clipboard_html')
  } catch (error) {
    logger.error('get_clipboard_html error: ', error)
  }
  try {
    text = await invoke<string>('get_clipboard_text')
  } catch (error) {
    logger.error('get_clipboard_text error: ', error)
  }

  return {
    html,
    text,
  }
}

interface ClipboardImagePayload {
  width: number
  height: number
  rgba: string
}

/**
 * The clipboard image as a PNG data URL, or null when there is no bitmap in the clipboard.
 *
 * Copying a picture from a browser does not put a file on the clipboard, so the pixels come
 * from the backend and the canvas in the webview encodes them.
 */
export const readClipboardImageDataUrl = async (): Promise<string | null> => {
  let payload: ClipboardImagePayload
  try {
    payload = await invoke<ClipboardImagePayload>('get_clipboard_image')
  } catch {
    return null
  }
  if (!payload || !payload.width || !payload.height) return null

  const binary = atob(payload.rgba)
  const pixels = new Uint8ClampedArray(binary.length)
  for (let index = 0; index < binary.length; index += 1) pixels[index] = binary.charCodeAt(index)

  const canvas = document.createElement('canvas')
  canvas.width = payload.width
  canvas.height = payload.height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.putImageData(new ImageData(pixels, payload.width, payload.height), 0, 0)
  return canvas.toDataURL('image/png')
}
