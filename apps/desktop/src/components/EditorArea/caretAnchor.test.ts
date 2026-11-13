import { describe, expect, it } from 'vitest'
import { blockAround, caretAnchor, findAnchorElement, normalizeForMatch } from './caretAnchor'

describe('anchor of the caret', () => {
  const note = [
    '---',
    'title: Filter context',
    '---',
    '',
    '# Intro',
    '',
    'Some paragraph here.',
    '',
    '## 1.4. Replacing a filter',
    '',
    'A different scenario',
    'that wraps two lines.',
  ]

  it('collects the block around the caret, not the whole section', () => {
    expect(blockAround(note, 11)).toEqual(['A different scenario', 'that wraps two lines.'])
  })

  it('anchors on the heading text when the caret sits on the heading', () => {
    expect(caretAnchor(note, 8)).toBe('1.4. replacing a filter')
  })

  it('anchors on the paragraph text when the caret is inside one', () => {
    expect(caretAnchor(note, 10)).toBe('a different scenario that wraps two line')
  })

  it('returns nothing on a blank line', () => {
    expect(caretAnchor(note, 9)).toBe('')
  })

  it('strips markdown noise so source and rendering can be compared', () => {
    expect(normalizeForMatch('**bold** and `code` and [link](url)')).toBe(
      'bold and code and link url',
    )
  })
})

describe('finding the anchor in the rendered note', () => {
  const render = (html: string) => {
    const container = document.createElement('div')
    container.innerHTML = html
    return container
  }

  it('matches a paragraph by its text', () => {
    const container = render('<h2>1.4. Replacing a filter</h2><p>A different scenario that wraps two lines.</p>')
    expect(findAnchorElement(container, 'a different scenario that wraps two line')?.tagName).toBe('P')
  })

  it('prefers the exact prefix over a loose match', () => {
    const container = render(
      '<p>Other text mentioning a different scenario that wraps two lines.</p>' +
        '<p>A different scenario that wraps two lines.</p>',
    )
    const found = findAnchorElement(container, 'a different scenario that wraps two line')
    expect(found?.textContent).toBe('A different scenario that wraps two lines.')
  })

  it('returns nothing when the text is not rendered', () => {
    expect(findAnchorElement(render('<p>Something else</p>'), 'missing paragraph')).toBeUndefined()
  })
})
