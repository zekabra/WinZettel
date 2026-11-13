import { describe, expect, it } from 'vitest'
import { closeHtmlBlocks } from './htmlBlockNormalization'

describe('closing raw HTML blocks for display', () => {
  it('adds a blank line after an HTML-only line', () => {
    const source = ['<u>under</u>', '~~struck~~', '==marked=='].join('\n')

    expect(closeHtmlBlocks(source)).toBe('<u>under</u>\n\n~~struck~~\n==marked==')
  })

  it('leaves an already separated note alone', () => {
    const source = ['<u>under</u>', '', '~~struck~~'].join('\n')

    expect(closeHtmlBlocks(source)).toBe(source)
  })

  it('does not touch fenced code', () => {
    const source = ['```', '<u>x</u>', '~~y~~', '```'].join('\n')

    expect(closeHtmlBlocks(source)).toBe(source)
  })

  it('ignores ordinary text that merely contains a tag', () => {
    const source = 'text with <u>inline</u> markup\nnext line'

    expect(closeHtmlBlocks(source)).toBe(source)
  })
})
