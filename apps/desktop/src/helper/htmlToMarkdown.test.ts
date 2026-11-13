// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { htmlToMarkdown } from './htmlToMarkdown'

describe('htmlToMarkdown', () => {
  it('keeps headings, emphasis and links', () => {
    const markdown = htmlToMarkdown(
      '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> and <a href="https://example.com">a link</a>.</p>',
    )

    expect(markdown).toBe('## Title\n\nSome **bold** and *italic* and [a link](https://example.com).')
  })

  it('renders unordered and ordered lists', () => {
    const markdown = htmlToMarkdown('<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>')

    expect(markdown).toContain('- one')
    expect(markdown).toContain('- two')
    expect(markdown).toContain('1. first')
  })

  it('fences code blocks with their language', () => {
    const markdown = htmlToMarkdown('<pre><code class="language-rust">fn main() {}</code></pre>')

    expect(markdown).toBe('```rust\nfn main() {}\n```')
  })

  it('converts tables to GitHub Markdown', () => {
    const markdown = htmlToMarkdown(
      '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
    )

    expect(markdown).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('keeps images and quotes', () => {
    const markdown = htmlToMarkdown(
      '<blockquote><p>quoted</p></blockquote><p><img src="photo.png" alt="a photo"></p>',
    )

    expect(markdown).toContain('> quoted')
    expect(markdown).toContain('![a photo](photo.png)')
  })

  it('returns an empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('')
    expect(htmlToMarkdown('   ')).toBe('')
  })
})
