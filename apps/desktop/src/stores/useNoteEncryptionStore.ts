import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'
import { getPathIdentityKey } from '@/helper/pathIdentity'

/**
 * Which notes are encrypted on disk, and which of those the owner has opened this session.
 *
 * The list of encrypted paths is filled by asking the backend for the first bytes of each
 * note (cheap), not by loading every file. A locked note is encrypted and was not unlocked:
 * it shows a note about it and cannot switch to the editor, because editing the ciphertext
 * would destroy the note.
 */
interface NoteEncryptionState {
  encryptedPaths: string[]
  lockedPaths: string[]
  /** Notes unlocked in this session; their pane reloads the plaintext from disk. */
  revealedPaths: string[]
  markEncrypted: (path: string) => void
  markDecrypted: (path: string) => void
  lock: (path: string) => void
  unlock: (path: string) => void
  markRevealed: (path: string) => void
  hydrate: (paths: string[]) => void
}

export const noteKey = (path: string): string => getPathIdentityKey(path)
const toggle = (list: string[], path: string, add: boolean): string[] => {
  const target = noteKey(path)
  const without = list.filter((entry) => entry !== target)
  return add ? [...without, target] : without
}

const useNoteEncryptionStore = create<NoteEncryptionState>((set) => ({
  encryptedPaths: [],
  lockedPaths: [],
  revealedPaths: [],
  markEncrypted: (path) => set((state) => ({ encryptedPaths: toggle(state.encryptedPaths, path, true) })),
  markDecrypted: (path) =>
    set((state) => ({
      encryptedPaths: toggle(state.encryptedPaths, path, false),
      lockedPaths: toggle(state.lockedPaths, path, false),
      revealedPaths: toggle(state.revealedPaths, path, false),
    })),
  lock: (path) => set((state) => ({ lockedPaths: toggle(state.lockedPaths, path, true) })),
  markRevealed: (path) =>
    set((state) => ({ revealedPaths: toggle(state.revealedPaths, path, true) })),
  unlock: (path) => set((state) => ({ lockedPaths: toggle(state.lockedPaths, path, false) })),
  hydrate: (paths) =>
    set((state) => ({
      encryptedPaths: paths.map(noteKey),
      // Nothing is unlocked until the owner supplies the passphrase this session.
      lockedPaths: paths.map(noteKey).filter((path) => state.lockedPaths.includes(path)),
    })),
}))

export const isNoteEncrypted = (path?: string): boolean =>
  !path ? false : useNoteEncryptionStore.getState().encryptedPaths.includes(noteKey(path))

export const isNoteLocked = (path?: string): boolean =>
  !path ? false : useNoteEncryptionStore.getState().lockedPaths.includes(noteKey(path))

/** Asks the backend whether a file starts with the encryption marker. */
export const readNoteEncryptionState = async (path: string): Promise<boolean> => {
  try {
    const encrypted = await invoke<boolean>('note_file_is_encrypted', { filePath: path })
    if (encrypted) useNoteEncryptionStore.getState().markEncrypted(path)
    return encrypted
  } catch {
    // A file that cannot be read is not worth a lock icon; the editor reports its own error.
    return false
  }
}

export default useNoteEncryptionStore
