import { describe, expect, it } from 'vitest'
import { imageSourceFromHtml } from './sourceRichPaste'

describe('imageSourceFromHtml', () => {
  it('finds the picture a browser copied', () => {
    const html = '<meta charset="utf-8"><img src="https://example.com/photo.png" alt="foto">'
    expect(imageSourceFromHtml(html)).toBe('https://example.com/photo.png')
  })

  it('handles single quotes and data URLs', () => {
    expect(imageSourceFromHtml("<img alt='x' src='data:image/png;base64,AAA'>")).toBe(
      'data:image/png;base64,AAA',
    )
  })

  it('returns null when there is no picture', () => {
    expect(imageSourceFromHtml('<p>só texto</p>')).toBeNull()
    expect(imageSourceFromHtml('')).toBeNull()
  })
})
