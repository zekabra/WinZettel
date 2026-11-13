import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  passphrase: 'teste5000',
  files: new Map<string, string>(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@/helper/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))
vi.mock('@/stores/useAppSettingStore', () => ({
  default: {
    getState: () => ({ settingData: { encryption_passphrase: mocks.passphrase } }),
    subscribe: () => () => {},
  },
}))

import { isEncryptedNote } from '@/helper/noteEncryption'
import { decryptNoteFile, encryptNoteFile } from './note-encryption'

const PATH = '/workspace/nota.md'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.passphrase = 'teste5000'
  mocks.files = new Map([[PATH, '# título\n\nconteúdo']])
  mocks.invoke.mockImplementation(async (command: string, args: Record<string, string>) => {
    if (command === 'get_file_content') {
      const content = mocks.files.get(args.filePath)
      return content === undefined
        ? { code: 'NotFound', content: 'not found' }
        : { code: 'Success', content }
    }
    if (command === 'write_file') {
      mocks.files.set(args.filePath, args.content)
      return { code: 'Success', content: 'ok' }
    }
    throw new Error(`unexpected command ${command}`)
  })
})

describe('note encryption service', () => {
  it('encrypts the note in place, keeping the same path', async () => {
    await encryptNoteFile(PATH)

    const stored = mocks.files.get(PATH)!
    expect(isEncryptedNote(stored)).toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('write_file', { filePath: PATH, content: stored })
  })

  it('decrypts back to the original content', async () => {
    const original = mocks.files.get(PATH)!
    await encryptNoteFile(PATH)
    await decryptNoteFile(PATH)

    expect(mocks.files.get(PATH)).toBe(original)
  })

  it('refuses to encrypt twice', async () => {
    await encryptNoteFile(PATH)
    await expect(encryptNoteFile(PATH)).rejects.toThrow(/already encrypted/i)
  })

  it('refuses to decrypt a plain note', async () => {
    await expect(decryptNoteFile(PATH)).rejects.toThrow(/not encrypted/i)
  })

  it('reports a wrong passphrase instead of writing garbage', async () => {
    await encryptNoteFile(PATH)
    const encrypted = mocks.files.get(PATH)!
    mocks.passphrase = 'outra-password'

    await expect(decryptNoteFile(PATH)).rejects.toThrow(/passphrase does not match/i)
    expect(mocks.files.get(PATH)).toBe(encrypted)
  })

  it('requires a passphrase before touching the file', async () => {
    mocks.passphrase = ''

    await expect(encryptNoteFile(PATH)).rejects.toThrow(/Settings/)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
