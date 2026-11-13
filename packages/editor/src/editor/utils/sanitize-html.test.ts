import { describe, expect, it } from 'vitest'
import { sanitizeMarkdownHtml } from './sanitize-html'

/**
 * Zettel Notes renders these three; a note written there must look the same here. Inline
 * styles stay forbidden — only the elements themselves are allowed.
 */
describe('inline elements shared with the Android app', () => {
  it('keeps underline, subscript and superscript', () => {
    const html = sanitizeMarkdownHtml(
      '<p><u>under</u> H<sub>2</sub>O x<sup>2</sup></p>',
    )

    expect(html).toContain('<u>under</u>')
    expect(html).toContain('<sub>2</sub>')
    expect(html).toContain('<sup>2</sup>')
  })

  it('still refuses what the Android app does not render', () => {
    const html = sanitizeMarkdownHtml('<p><span style="color:red">x</span></p>')

    expect(html).not.toContain('style=')
  })
})
