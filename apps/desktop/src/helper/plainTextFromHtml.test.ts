// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { plainTextFromHtml } from '@/helper/htmlToMarkdown'
it('probe', () => {
  expect(plainTextFromHtml('<p>Olá <b>mundo</b></p><p>linha 2</p>')).toBe('Olá mundo\nlinha 2')
})
