import { describe, expect, it } from 'vitest'
import type { IFile } from '@/helper/filesys'
import { collectNoteCounts, collectNotesIn } from './noteCounts'

const note = (id: string, name: string): IFile => ({
  id,
  kind: 'file',
  name,
  path: `/ws/${name}`,
  ext: name.split('.').pop(),
})

const dir = (id: string, name: string, children: IFile[]): IFile => ({
  id,
  kind: 'dir',
  name,
  path: `/ws/${name}`,
  children,
})

describe('note counts', () => {
  const tree = [
    dir('root', 'ws', [
      note('a', 'a.md'),
      note('b', 'b.markdown'),
      note('c', 'c.txt'),
      note('img', 'picture.png'),
      note('pdf', 'doc.pdf'),
      dir('sub', 'sub', [note('d', 'd.md'), note('e', 'attachment.jpeg')]),
    ]),
  ]

  it('counts notes recursively and ignores attachments', () => {
    const { total, byPath } = collectNoteCounts(tree)

    expect(total).toBe(4)
    expect(byPath.get('/ws/sub')).toBe(1)
    expect(byPath.get('/ws/ws')).toBe(4)
  })

  it('lists the notes of one folder for a bulk action', () => {
    const folder = dir('sub', 'sub', [note('d', 'd.md'), note('e', 'attachment.jpeg')])

    expect(collectNotesIn(folder).map((file) => file.name)).toEqual(['d.md'])
  })

  it('reports zero for a folder without notes', () => {
    expect(collectNotesIn(dir('empty', 'empty', [note('img', 'a.png')]))).toEqual([])
  })
})
