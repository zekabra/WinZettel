import { getFileObject } from '@/helper/files'
import useNoteEncryptionStore, { noteKey } from '@/stores/useNoteEncryptionStore'

/**
 * Whether a note is encrypted and still not unlocked.
 *
 * Search, the editor and the mode switch all need this answer; keeping one definition means
 * they cannot disagree — a locked note searching its own ciphertext was exactly that.
 */
export const useNoteIsLocked = (fileId?: string): boolean => {
  const path = fileId ? getFileObject(fileId)?.path : undefined
  const key = path ? noteKey(path) : undefined

  return useNoteEncryptionStore((state) => {
    if (!key) return false
    if (state.lockedPaths.includes(key)) return true
    return state.encryptedPaths.includes(key) && !state.revealedPaths.includes(key)
  })
}

/** The same answer outside React, for event handlers and services. */
export const isNoteLockedPath = (path?: string): boolean => {
  if (!path) return false
  const key = noteKey(path)
  const state = useNoteEncryptionStore.getState()
  if (state.lockedPaths.includes(key)) return true
  return state.encryptedPaths.includes(key) && !state.revealedPaths.includes(key)
}
