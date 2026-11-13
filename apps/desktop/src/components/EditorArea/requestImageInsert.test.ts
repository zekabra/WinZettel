import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  imageInsert: vi.fn(),
  handleInsertLocalImage: vi.fn(),
}))

vi.mock('@/services/dialog', () => ({ dialog: { imageInsert: mocks.imageInsert } }))
vi.mock('./imageHandlers', () => ({
  handleInsertLocalImage: mocks.handleInsertLocalImage,
}))

import { requestImageInsert } from './requestImageInsert'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requestImageInsert', () => {
  it('returns nothing when the picker is dismissed', async () => {
    mocks.imageInsert.mockResolvedValue(null)

    await expect(requestImageInsert('file')).resolves.toBeNull()
    expect(mocks.handleInsertLocalImage).not.toHaveBeenCalled()
  })

  it('keeps a remote URL as an image', async () => {
    mocks.imageInsert.mockResolvedValue({ type: 'url', url: 'https://example.com/a.png' })

    await expect(requestImageInsert('file')).resolves.toEqual({
      kind: 'image',
      attributes: { src: 'https://example.com/a.png' },
    })
  })

  it('embeds a selected image file', async () => {
    mocks.imageInsert.mockResolvedValue({ type: 'local', path: '/in/photo.png' })
    mocks.handleInsertLocalImage.mockResolvedValue({
      src: '/.assets/photo.png',
      alt: 'photo',
    })

    await expect(requestImageInsert('file')).resolves.toEqual({
      kind: 'image',
      attributes: { src: '/.assets/photo.png', alt: 'photo' },
    })
  })

  it('links a selected file that the preview cannot render as an image', async () => {
    mocks.imageInsert.mockResolvedValue({ type: 'local', path: '/in/report.pdf' })
    mocks.handleInsertLocalImage.mockResolvedValue({
      src: '/.assets/report.pdf',
      alt: 'report',
    })

    await expect(requestImageInsert('file')).resolves.toEqual({
      kind: 'link',
      href: '/.assets/report.pdf',
      text: 'report',
    })
  })

  it('recognises uppercase image extensions', async () => {
    mocks.imageInsert.mockResolvedValue({ type: 'local', path: 'C:\\in\\PHOTO.JPEG' })
    mocks.handleInsertLocalImage.mockResolvedValue({
      src: '/.assets/photo.jpeg',
      alt: 'photo',
    })

    await expect(requestImageInsert('file')).resolves.toMatchObject({ kind: 'image' })
  })
})
