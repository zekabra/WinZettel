// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { blockIdentity, blockIndexAtLine, findBlockElement, renderedBlocks, sourceBlocks } from './previewBlocks'

const render = (html: string): HTMLElement => {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('source blocks', () => {
  const note = [
    '## Intro',
    '',
    '- Seria possível transmitir uma execução em direto?',
    '',
    '_ mesmo',
    '',
    '1. testando',
    '',
    '![](/.assets/image_1795204383583.png)',
    '',
    '---',
    '',
    '```js',
    'const a = 1',
    '```',
  ]

  it('numbers blocks by their source lines, including lists and fences', () => {
    const blocks = sourceBlocks(note.join('\n'))

    // heading, lista, parágrafo, lista ordenada, parágrafo com imagem, hr, cerca de código
    expect(blocks).toHaveLength(7)
    expect(blockIndexAtLine(blocks, 0)).toBe(0)
    expect(blockIndexAtLine(blocks, 2)).toBe(1)
    expect(blockIndexAtLine(blocks, 4)).toBe(2)
    expect(blockIndexAtLine(blocks, 6)).toBe(3)
    expect(blockIndexAtLine(blocks, 8)).toBe(4)
    expect(blockIndexAtLine(blocks, 12)).toBe(6)
  })

  it('has no block on a blank line', () => {
    const blocks = sourceBlocks(note.join('\n'))
    expect(blockIndexAtLine(blocks, 1)).toBe(-1)
  })

  it('strips markers and destinations from the identity text', () => {
    const lines = note.join('\n').split('\n')
    const blocks = sourceBlocks(note.join('\n'))

    const listText = blockIdentity(lines, blocks[1]).text
    expect(listText.startsWith('seria possível transmitir uma execução')).toBe(true)
    // O marcador "- " não faz parte do texto que o preview mostra.
    expect(listText.startsWith('-')).toBe(false)
    expect(blockIdentity(lines, blocks[3]).text).toBe('testando')
    expect(blockIdentity(lines, blocks[4]).image).toBe('/.assets/image_1795204383583.png')
  })
})

describe('finding the rendered block', () => {
  const lines = ['- Seria possível transmitir uma execução', '', '_ mesmo', '', '![](/image_1.png)']
  const blocks = sourceBlocks(lines.join('\n'))

  it('finds a list block whose text starts with a marker', () => {
    const container = render('<ul><li>Seria possível transmitir uma execução</li></ul><p>_ mesmo</p>')

    const element = findBlockElement(container, blocks, 0, lines)
    expect(element?.tagName).toBe('UL')
  })

  it('matches a list whose rendered items are joined without separators', () => {
    const list = ['- 1. Marilyn Monroe', '- 2. Humphrey Bogart', '', '![](/image_1.png)']
    const listBlocks = sourceBlocks(list.join('\n'))
    const container = render(
      '<ul><li>1. Marilyn Monroe</li><li>2. Humphrey Bogart</li></ul><p><img src="/image_1.png"></p>',
    )

    expect(blockIdentity(list, listBlocks[0]).text).toBe('1. marilyn monroe')
    expect(findBlockElement(container, listBlocks, 1, list)?.tagName).toBe('UL')
  })

  it('recognises an image whose src was rewritten to an asset URL', () => {
    const image = ['![](/.assets/image_1.png)']
    const imageBlocks = sourceBlocks(image.join('\n'))
    const container = render(
      '<p><img src="http://asset.localhost/E%3A%2Fnotas%2F.assets%2Fimage_1.png"></p>',
    )

    expect(findBlockElement(container, imageBlocks, 0, image)).toBeDefined()
  })

  it('matches a rendered table whose cells are concatenated', () => {
    const table = ['| Column 1 | Column 2 |', '| --- | --- |', '|  dfgd  |   |']
    const tableBlocks = sourceBlocks(table.join('\n'))
    const container = render(
      '<table><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>dfgd</td><td></td></tr></tbody></table>',
    )

    expect(blockIdentity(table, tableBlocks[0]).text).toBe('column 1')
    expect(findBlockElement(container, tableBlocks, 2, table)?.tagName).toBe('TABLE')
  })

  it('accepts an image paragraph whose src became a blob', () => {
    const image = [
      '![Reinaldo Dennes, à esquerda, foi executado](https://thumbs.example.io/?epic=abc&webp=1)',
    ]
    const imageBlocks = sourceBlocks(image.join('\n'))
    const container = render('<p><img alt="Reinaldo Dennes, à esquerda, foi executado" src="blob:http://tauri.localhost/1"></p>')

    expect(findBlockElement(container, imageBlocks, 0, image)).toBeDefined()
  })

  it('finds a paragraph holding only an image, by its source', () => {
    const container = render('<ul><li>primeiro</li></ul><p>_ mesmo</p><p><img src="/image_1.png"></p>')

    const element = findBlockElement(container, blocks, 4, lines)
    expect(element?.querySelector('img')?.getAttribute('src')).toBe('/image_1.png')
  })

  it('never moves when the pane has not rendered that block yet', () => {
    const container = render('<p>texto</p>')

    expect(findBlockElement(container, blocks, 4, lines)).toBeUndefined()
  })

  it('never moves on a blank line', () => {
    const container = render('<p>texto</p>')

    expect(findBlockElement(container, blocks, 1, lines)).toBeUndefined()
  })

  it('ignores layout wrappers when counting blocks', () => {
    const container = render('<div class="inner"><p>um</p><p>dois</p></div>')

    expect(renderedBlocks(container).map((element) => element.tagName)).toEqual(['P', 'P'])
  })
})
