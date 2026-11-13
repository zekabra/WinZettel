import { invoke } from '@tauri-apps/api/core'
import { dialog } from '@/services/dialog'
import { decryptNoteFileWithPassphrase } from '@/services/note-encryption'
import { logger } from '@/helper/logger'
import { i18n } from '@/i18n'
import { toast } from 'zens'
import { WrongPassphraseError } from '@/helper/noteEncryption'
import { noteKey } from '@/stores/useNoteEncryptionStore'
import useNoteEncryptionStore, { readNoteEncryptionState } from '@/stores/useNoteEncryptionStore'

/**
 * Passphrases typed this session, one entry per note the owner chose to open.
 *
 * Not one global value: unlocking one note must never unlock the rest. Kept in memory only,
 * so closing the app forgets them.
 */
const sessionPassphrases = new Map<string, string>()

const key = (path: string) => noteKey(path)

export const forgetSessionPassphrase = (path?: string): void => {
  if (path) sessionPassphrases.delete(key(path))
  else sessionPassphrases.clear()
}

const promptForPassphrase = async (): Promise<string | null> => {
  const value = await dialog.inputConfirm({
    title: i18n.t('encryption.unlock.title'),
    inputProps: {
      type: 'password',
      placeholder: i18n.t('settings.encryption.passphrase.placeholder'),
    },
  })
  return typeof value === 'string' && value ? value : null
}

/**
 * One prompt per note.
 *
 * The dialog service queues requests, so two callers for the same note would ask twice; a
 * second note must be free to ask straight away, which a global lock would prevent.
 */
const inFlight = new Map<string, Promise<boolean>>()

/**
 * Opens an encrypted note in place: asks for the passphrase, decrypts the file, and returns
 * whether it is now readable.
 *
 * A wrong passphrase asks again — cancelling is the only way out. Cancelling keeps the note
 * locked, so its pane shows a notice and never mounts the editor: writing into the
 * ciphertext would make the note impossible to decrypt later.
 */
export const unlockNote = (path: string, force = false): Promise<boolean> => {
  const noteKey = key(path)
  const running = inFlight.get(noteKey)
  if (running) return running
  const promise = requestPassphrase(path, force).finally(() => {
    inFlight.delete(noteKey)
  })
  inFlight.set(noteKey, promise)
  return promise
}

const requestPassphrase = async (path: string, force = false): Promise<boolean> => {
  const store = useNoteEncryptionStore.getState()
  // `force` is used by the lock pane: it is looking at ciphertext, so the question is worth
  // asking even if the backend check disagreed.
  if (!force && !(await readNoteEncryptionState(path))) return true

  for (;;) {
    const candidate = sessionPassphrases.get(key(path)) ?? (await promptForPassphrase())
    if (!candidate) {
      store.lock(path)
      return false
    }

    try {
      await decryptNoteFileWithPassphrase(path, candidate)
      sessionPassphrases.set(key(path), candidate)
      store.markDecrypted(path)
      store.markRevealed(path)
      store.unlock(path)
      toast.success(i18n.t('encryption.unlock.done'))
      return true
    } catch (error) {
      if (error instanceof WrongPassphraseError) {
        sessionPassphrases.delete(key(path))
        toast.error(i18n.t('encryption.unlock.wrong'))
        continue
      }
      logger.error(error)
      store.lock(path)
      toast.error(error instanceof Error ? error.message : String(error))
      return false
    }
  }
}

/** Reads the marker without prompting: used to paint the lock icon in the tree. */
export const markEncryptionState = async (path: string): Promise<void> => {
  await readNoteEncryptionState(path)
}

/** Reads a note from disk without interpreting it; used to reload after decrypting. */
export const readNoteContent = async (path: string): Promise<string | null> => {
  try {
    const result = await invoke<{ code: string; content: string }>('get_file_content', {
      filePath: path,
    })
    return result.code === 'success' ? result.content : null
  } catch (error) {
    logger.error(error)
    return null
  }
}
