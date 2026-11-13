import { describe, expect, it } from 'vitest'
import {
  WrongPassphraseError,
  decryptNote,
  encryptNote,
  isEncryptedNote,
} from '../noteEncryption'

const MAGIC = '\uE000\uE001ENC\uE003\uE004'

// A note encrypted by Zettel Notes 3.1.4 itself (End-to-end encryption) with the
// throwaway passphrase below and the plaintext "isto é um teste". This is the
// compatibility contract: if the app ever changes its envelope, this fixture stops
// decrypting. Never put a real passphrase here — this repository is public.
const ZETTEL_NOTES_NOTE =
  MAGIC +
  'Une5WfHIItIExa6vshd9ODOOSgK0g7HQRXtVWpWqRbNwNNO6FprqLQ1sL3bvk9sWekZR9idrwKzD9Y8X0lEbnFMF5U+zW2Vxiunye4Gggm2DcowxLnh1dmJFHma66YSosDht9/fmgoWCjfDz5EhkkcTx93vdQ2thKHozHOkL0EJ5cG1ZcE95dDhnMVg3cG9wR2FvSVhRPT06WGFCSjRrcDNNeVZnbmp2KzN5bkVVeWpqNm1Gb0NsOTIrZWVHc0tkUVRaTT06TEdnVno4cEhjYzRCWVMyWHJTR0ljcW9lTS9xOFhxckRGU3hQNitiYzF4bz0='

const PASSPHRASE = 'teste5000'

describe('note encryption', () => {
  it('decrypts a note produced by Zettel Notes', async () => {
    await expect(decryptNote(ZETTEL_NOTES_NOTE, PASSPHRASE)).resolves.toBe('isto é um teste')
  })

  it('rejects the wrong passphrase instead of returning noise', async () => {
    await expect(decryptNote(ZETTEL_NOTES_NOTE, 'teste5001')).rejects.toBeInstanceOf(
      WrongPassphraseError,
    )
  })

  it('recognises its own envelope', () => {
    expect(isEncryptedNote(ZETTEL_NOTES_NOTE)).toBe(true)
    expect(isEncryptedNote('# a plain note')).toBe(false)
  })

  it('round-trips Markdown with unicode and padding boundaries', async () => {
    const plaintext = '# Título\n\nlinha com acção e emoji 🚢\n'
    const encrypted = await encryptNote(plaintext, PASSPHRASE)

    expect(isEncryptedNote(encrypted)).toBe(true)
    await expect(decryptNote(encrypted, PASSPHRASE)).resolves.toBe(plaintext)
  })

  it('produces the exact envelope the Android app reads', async () => {
    const encrypted = await encryptNote('teste', PASSPHRASE)
    const payload = Buffer.from(encrypted.slice(MAGIC.length), 'base64')

    expect(payload.length).toBe(128 + Buffer.from(payload.subarray(128).toString('utf8'), 'utf8').length)
    const parts = payload.subarray(128).toString('utf8').split(':')
    expect(parts).toHaveLength(3)
    expect(Buffer.from(parts[0], 'base64')).toHaveLength(16) // iv
    expect(Buffer.from(parts[1], 'base64')).toHaveLength(32) // hmac
    expect(Buffer.from(parts[2], 'base64')).toHaveLength(16) // ciphertext of "teste"
  })

  it('refuses content without the envelope', async () => {
    await expect(decryptNote('plain', PASSPHRASE)).rejects.toThrow()
  })
})
