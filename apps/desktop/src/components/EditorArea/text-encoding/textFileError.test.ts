import { beforeEach, describe, expect, it } from 'vitest'
import i18n, { createInstance, i18nInit, locales, type Langs } from '../../../../../../packages/i18n/src/desktop'
import { formatTextFileError, getTextFileErrorCode } from './textFileError'

beforeEach(async () => { await i18nInit({ lng: 'es' }) })

describe('text file error presentation', () => {
  it.each([
  ])('translates the native Rust error %s', (message, expected) => {
    const result = formatTextFileError(message, i18n.t)
    expect(result).toContain(expected)
    expect(result).not.toContain('text_')
    expect(result).not.toContain('UTF-16 offset')
  })

  it('preserves the code across string and Error IPC representations', () => {
    expect(getTextFileErrorCode('text_confirm_encoding: Confirm it.')).toBe('text_confirm_encoding')
    expect(getTextFileErrorCode(new Error('text_confirm_encoding: Confirm it.'))).toBe('text_confirm_encoding')
    expect(getTextFileErrorCode('Error: text_confirm_encoding: Confirm it.')).toBe('text_confirm_encoding')
    expect(getTextFileErrorCode('Failed to write /text_notes/file.md')).toBeUndefined()
  })

  it('uses the current language and identifies the character without exposing an internal offset', async () => {
    await i18nInit({ lng: 'en' })
    const result = formatTextFileError(
      new Error("text_unmappable: Character '🙂' (U+1F642) at UTF-16 offset 52 cannot be saved in GBK."),
      i18n.t,
    )
    expect(result).toContain('GBK cannot save the character “🙂”')
    expect(result).toContain('Save as UTF-8')
    expect(result).not.toContain('offset')
  })

  it.each(Object.keys(locales) as Langs[])('uses the current locale encoding-confirmation copy for %s', async (lng) => {
    await i18nInit({ lng })
    const expected = i18n.getResource(lng, 'translation', 'text_encoding.errors.confirm_encoding')
    expect(expected).toEqual(expect.any(String))
    expect(expected).not.toBe('')
    expect(formatTextFileError('text_confirm_encoding: Confirm it.', i18n.t)).toBe(expected)
  })

  it.each(['frFR', 'es', 'ja'])('provides readable fallback copy when %s lacks the translation', async (lng) => {
    // Keep the missing-translation fixture independent of completed locale copy.
    const translations = createInstance()
    await translations.init({
      lng,
      fallbackLng: i18n.options.fallbackLng,
      resources: { en: { translation: i18n.getResourceBundle('en', 'translation') } },
    })
    expect(translations.getResource(lng, 'translation', 'text_encoding.errors.confirm_encoding')).toBeUndefined()
    expect(formatTextFileError('text_confirm_encoding: Confirm it.', translations.t)).toContain(
      'The detected encoding has not been confirmed.',
    )
  })

  it.each(['U+FFFFFF', 'U+D800'])('ignores an invalid character detail %s', (point) => {
    const result = formatTextFileError(
      `text_unmappable: Character 'x' (${point}) at UTF-16 offset 52 cannot be saved in GBK.`, i18n.t,
    )
    expect(result).not.toContain(point)
  })

  it.each(['read', 'save', 'preview'] as const)('uses a safe %s fallback for unknown errors', (operation) => {
    const result = formatTextFileError(new Error('internal error at /private/user/file.md:123'), i18n.t, operation)
    expect(result).not.toContain('/private')
    expect(result).not.toContain('internal')
    expect(result).not.toContain('text_encoding.errors')
  })

  it.each(['constructor', '__proto__', 'text_unknown: internal details'])('does not treat %s as a translation key', (error) => {
    expect(formatTextFileError(new Error(error), i18n.t)).not.toContain('text_unknown')
  })

  it.each([
  ])('retains actionable preview protection for %s', (error, expected) => {
    expect(formatTextFileError(new Error(error), i18n.t, 'preview')).toContain(expected)
  })
})
