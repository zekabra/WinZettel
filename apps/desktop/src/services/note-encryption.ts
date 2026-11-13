import { invoke } from '@tauri-apps/api/core'
import { FileResultCode, type FileSysResult } from '@/helper/filesys'
import { logger } from '@/helper/logger'
import { decryptNote, encryptNote, isEncryptedNote } from '@/helper/noteEncryption'
import useAppSettingStore from '@/stores/useAppSettingStore'

/** Stored in the app settings file so encryption stays automatic once configured. */
export const ENCRYPTION_PASSPHRASE_KEY = 'encryption_passphrase'

export const getEncryptionPassphrase = (): string => {
  const value = useAppSettingStore.getState().settingData[ENCRYPTION_PASSPHRASE_KEY]
  return typeof value === 'string' ? value : ''
}

export const hasEncryptionPassphrase = (): boolean => getEncryptionPassphrase().length > 0

const readNoteFile = async (filePath: string): Promise<string> => {
  const result = await invoke<FileSysResult>('get_file_content', { filePath })
  if (result.code !== FileResultCode.Success) throw new Error(result.content)
  return result.content
}

const writeNoteFile = async (filePath: string, content: string): Promise<void> => {
  const result = await invoke<FileSysResult>('write_file', { filePath, content })
  if (result.code !== FileResultCode.Success) throw new Error(result.content)
}

const requirePassphrase = (): string => {
  const passphrase = getEncryptionPassphrase()
  if (!passphrase) throw new Error('Set the encryption passphrase in Settings → Encryption first')
  return passphrase
}

/** Encrypts the note in place: same file, same name, encrypted content. */
export const encryptNoteFile = async (filePath: string): Promise<void> => {
  const passphrase = requirePassphrase()
  const content = await readNoteFile(filePath)
  if (isEncryptedNote(content)) throw new Error('This note is already encrypted')
  const encrypted = await encryptNote(content, passphrase)
  await writeNoteFile(filePath, encrypted)
  logger.info('Encrypted note:', filePath)
}

/** Decrypts the note in place with an explicitly supplied passphrase. */
export const decryptNoteFileWithPassphrase = async (
  filePath: string,
  passphrase: string,
): Promise<void> => {
  const content = await readNoteFile(filePath)
  if (!isEncryptedNote(content)) throw new Error('This note is not encrypted')
  const plaintext = await decryptNote(content, passphrase)
  await writeNoteFile(filePath, plaintext)
  logger.info('Decrypted note:', filePath)
}

/** Decrypts the note in place. Throws when the passphrase does not match. */
export const decryptNoteFile = async (filePath: string): Promise<void> => {
  const passphrase = requirePassphrase()
  const content = await readNoteFile(filePath)
  if (!isEncryptedNote(content)) throw new Error('This note is not encrypted')
  const plaintext = await decryptNote(content, passphrase)
  await writeNoteFile(filePath, plaintext)
  logger.info('Decrypted note:', filePath)
}
