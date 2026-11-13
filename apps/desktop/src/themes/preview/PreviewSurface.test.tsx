import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseThemeDocument, resolveTheme } from '@markflowy/theme/semantic'
import { PreviewSurface } from './PreviewSurface'

const labels = {
  preview: 'Preview',
  loadError: 'Failed',
  error: 'Error',
  retry: 'Retry',
  previewNotes: 'Notes',
  previewIdeas: 'Ideas',
  previewWelcome: 'Welcome',
  previewSearch: 'Search preview',
  previewSearchPlaceholder: 'Search…',
  previewNewNote: 'New note',
}
function theme(color: string) {
  const document = parseThemeDocument({
    version: 1,
    id: 'test',
    name: 'Test',
    variants: [
      { id: 'light', name: 'Light', mode: 'light', tokens: { 'editor.background': color } },
    ],
  })
  return resolveTheme(document, document.variants[0])
}

afterEach(cleanup)

function previewContent(container: HTMLElement) {
  return waitFor(
    () => {
      const content = container.querySelector<HTMLElement>('.mf-preview-content')
      expect(content?.textContent).toContain('A little structure')
      return content!
    },
    { timeout: 10_000 },
  )
}

describe('preview document surface', () => {
  it('renders the Markdown document as a reading surface and keeps it across theme changes', async () => {
    const inspect = vi.fn()
    const view = render(
      <PreviewSurface
        theme={theme('#ffffff')}
        snippets={[]}
        inspect={false}
        labels={labels}
        onInspect={inspect}
      />,
    )
    const content = await previewContent(view.container)
    expect(content.textContent).toContain('A place for ideas')
    expect(content.querySelector('h2')?.textContent).toBe('A little structure')

    view.rerender(
      <PreviewSurface
        theme={theme('#eeeeee')}
        snippets={[]}
        inspect={false}
        labels={{ ...labels, previewWelcome: '欢迎', previewSearch: '搜索预览' }}
        onInspect={inspect}
      />,
    )
    expect(view.container.querySelector('[aria-current="page"]')?.textContent).toBe('欢迎.md')
    fireEvent.click(screen.getByRole('button', { name: '搜索预览' }))
    expect(screen.getByRole('textbox', { name: '搜索预览' })).toBeTruthy()
    await previewContent(view.container)
    expect(view.container.querySelector('.mf-preview-content')).toBe(content)
    expect(content.textContent).toContain('A place for ideas')
  })

  it('applies draft CSS to the document scope without affecting preview controls or remounting', async () => {
    const renderPreview = (spacing: string) => (
      <>
        <h1>Outside the document</h1>
        <PreviewSurface
          theme={theme('#ffffff')}
          snippets={[
            {
              id: 'draft',
              css: `.mf-editor-content .mf-preview-content h2 { letter-spacing: ${spacing}; }`,
            },
          ]}
          inspect={false}
          labels={labels}
          onInspect={vi.fn()}
        />
      </>
    )
    const view = render(renderPreview('1px'))
    await previewContent(view.container)
    const heading = view.container.querySelector<HTMLElement>('.mf-preview-content h2')!
    expect(getComputedStyle(heading).letterSpacing).toBe('1px')
    expect(
      getComputedStyle(screen.getByRole('heading', { name: 'Outside the document' })).letterSpacing,
    ).not.toBe('1px')

    view.rerender(renderPreview('2px'))
    expect(getComputedStyle(heading).letterSpacing).toBe('2px')
    expect(view.container.querySelector('.mf-preview-content h2')).toBe(heading)
  })

  it('inspects roles and keeps personal CSS snippets in separate style sheets', async () => {
    const inspect = vi.fn()
    const view = render(
      <PreviewSurface
        theme={theme('#ffffff')}
        snippets={[
          { id: 'a', css: 'body{' },
          { id: 'b', css: 'body{color:red}' },
        ]}
        inspect
        labels={labels}
        onInspect={inspect}
      />,
    )
    fireEvent.click(view.container.querySelector('[aria-current="page"]')!)
    expect(inspect).toHaveBeenCalledWith('interaction.selected')
    for (const token of [
      'chrome.titlebar.background',
      'chrome.sidebar.background',
      'chrome.tab.background',
      'chrome.tab.activeBackground',
      'chrome.statusbar.background',
    ]) {
      fireEvent.contextMenu(view.container.querySelector(`[data-theme-token="${token}"]`)!)
      expect(inspect).toHaveBeenLastCalledWith(token)
    }
    expect(
      [...view.container.querySelectorAll('[data-mf-css-snippet]')].map(
        (style) => style.textContent,
      ),
    ).toEqual(['body{', 'body{color:red}'])
    await previewContent(view.container)
  })
})
