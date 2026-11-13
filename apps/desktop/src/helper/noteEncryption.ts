/**
 * Note encryption compatible with Zettel Notes 3.x "End-to-end encryption".
 *
 * File layout, recovered from the Android app (org.eu.thedoc.zettelnotes 3.1.4,
 * `ow1.b` → `ow1.c` → `w8.d`/`w8.b`):
 *
 *   <magic><base64( salt128 || b64(iv16) ":" b64(mac32) ":" b64(ct) )>
 *
 * - key material: sha256 hex of the passphrase, used as the PBKDF2 password
 * - KDF: PBKDF2-HMAC-SHA1, 10000 iterations, 384 bits over the 128-byte salt
 * - derived: bytes 0..16 = AES-128 key, bytes 16..48 = HMAC-SHA256 key
 * - cipher: AES-128-CBC with PKCS#5 padding and a random 16-byte IV
 * - MAC: HMAC-SHA256 over iv || ciphertext
 *
 * Verified against a note produced by the app itself.
 */
const MAGIC = '\uE000\uE001ENC\uE003\uE004'
const SALT_BYTES = 128
const IV_BYTES = 16
const ITERATIONS = 10000
const DERIVED_BITS = 384

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const subtle = (): SubtleCrypto => {
  const available = globalThis.crypto?.subtle
  if (!available) throw new Error('WebCrypto is not available in this runtime')
  return available
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** WebCrypto wants a plain ArrayBuffer, not a view over a larger one. */
const bufferOf = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy.buffer
}

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** The app feeds the lowercase SHA-256 hex of the passphrase into PBKDF2. */
const passphraseKeyMaterial = async (passphrase: string): Promise<Uint8Array> => {
  const digest = await subtle().digest('SHA-256', bufferOf(encoder.encode(passphrase)))
  return encoder.encode(hex(new Uint8Array(digest)))
}

interface DerivedKeys {
  cipher: CryptoKey
  mac: CryptoKey
}

const deriveKeys = async (passphrase: string, salt: Uint8Array): Promise<DerivedKeys> => {
  const baseKey = await subtle().importKey(
    'raw',
    bufferOf(await passphraseKeyMaterial(passphrase)),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = new Uint8Array(
    await subtle().deriveBits(
      { name: 'PBKDF2', hash: 'SHA-1', salt: bufferOf(salt), iterations: ITERATIONS },
      baseKey,
      DERIVED_BITS,
    ),
  )
  const cipher = await subtle().importKey('raw', bits.subarray(0, 16), 'AES-CBC', false, [
    'encrypt',
    'decrypt',
  ])
  const mac = await subtle().importKey(
    'raw',
    bufferOf(bits.subarray(16, 48)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  return { cipher, mac }
}

export const isEncryptedNote = (content: string): boolean => content.startsWith(MAGIC)

export const encryptNote = async (plaintext: string, passphrase: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const { cipher, mac } = await deriveKeys(passphrase, salt)
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: 'AES-CBC', iv: bufferOf(iv) }, cipher, bufferOf(encoder.encode(plaintext))),
  )
  const tag = new Uint8Array(await subtle().sign('HMAC', mac, bufferOf(concat(iv, ciphertext))))
  const body = `${toBase64(iv)}:${toBase64(tag)}:${toBase64(ciphertext)}`
  return MAGIC + toBase64(concat(salt, encoder.encode(body)))
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('The passphrase does not match this note')
    this.name = 'WrongPassphraseError'
  }
}

export const decryptNote = async (content: string, passphrase: string): Promise<string> => {
  if (!isEncryptedNote(content)) throw new Error('The note is not encrypted')
  const payload = fromBase64(content.slice(MAGIC.length).trim())
  if (payload.length <= SALT_BYTES) throw new Error('The encrypted note is truncated')

  const salt = payload.subarray(0, SALT_BYTES)
  const body = decoder.decode(payload.subarray(SALT_BYTES))
  const [ivPart, tagPart, ciphertextPart] = body.split(':')
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error('The encrypted note is malformed')

  const iv = fromBase64(ivPart)
  const tag = fromBase64(tagPart)
  const ciphertext = fromBase64(ciphertextPart)
  const { cipher, mac } = await deriveKeys(passphrase, salt)

  const authentic = await subtle().verify('HMAC', mac, bufferOf(tag), bufferOf(concat(iv, ciphertext)))
  if (!authentic) throw new WrongPassphraseError()

  const plaintext = new Uint8Array(
    await subtle().decrypt({ name: 'AES-CBC', iv: bufferOf(iv) }, cipher, bufferOf(ciphertext)),
  )
  return decoder.decode(plaintext)
}
