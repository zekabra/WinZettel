import type { EditorFindApi, EditorFindState } from '../editorFindApi'
import { findInPreview, paintPreviewMatches, scrollPreviewMatchIntoView } from './previewFind'

interface PreviewFindEntry {
  container: HTMLElement
  api: EditorFindApi
}

const entries = new Map<string, PreviewFindEntry>()
const keyFor = (fileId: string, groupId?: string) => JSON.stringify([groupId, fileId])

/**
 * Find inside the reading pane, exposed through the same contract the source editor uses
 * so the toolbar bar is one implementation instead of two. Replace is deliberately a
 * no-op: the preview renders the note, it does not own its text.
 */
const createPreviewFind = (container: HTMLElement): EditorFindApi => {
  let state: EditorFindState = { caseSensitive: false, matches: [], query: '' }
  let ranges: ReturnType<typeof findInPreview> = []
  const listeners = new Set<(next: EditorFindState) => void>()

  const publish = (next: Partial<EditorFindState>): EditorFindState => {
    state = { ...state, ...next }
    listeners.forEach((listener) => listener(state))
    return state
  }

  const paint = (activeIndex?: number) => {
    paintPreviewMatches(ranges, activeIndex ?? -1)
  }

  const search: EditorFindApi['search'] = ({ query, caseSensitive, activeIndex }) => {
    // The controller re-runs the search before every next/previous. Keeping the current
    // index when the term did not change is what lets navigation advance; resetting it to
    // zero pinned every click to the first match.
    const sameQuery = query === state.query && Boolean(caseSensitive) === state.caseSensitive
    ranges = findInPreview(container, query, caseSensitive)
    const requested = activeIndex ?? (sameQuery ? (state.activeIndex ?? 0) : 0)
    const index =
      ranges.length === 0 ? undefined : ((requested % ranges.length) + ranges.length) % ranges.length
    paint(index)
    if (index !== undefined) scrollPreviewMatchIntoView(ranges[index])
    return publish({
      query,
      caseSensitive: Boolean(caseSensitive),
      activeIndex: index,
      matches: ranges.map(() => ({ from: 0, to: 0 })),
    })
  }

  const navigateTo: NonNullable<EditorFindApi['navigateTo']> = async (index: number) => {
    if (ranges.length === 0) return null
    const next = ((index % ranges.length) + ranges.length) % ranges.length
    paint(next)
    scrollPreviewMatchIntoView(ranges[next])
    publish({ activeIndex: next })
    return null
  }

  return {
    open: () => state,
    close: () => {
      ranges = []
      paintPreviewMatches([], 0)
      return publish({ query: '', matches: [], activeIndex: undefined })
    },
    clear: () => {
      ranges = []
      paintPreviewMatches([], 0)
      return publish({ query: '', matches: [], activeIndex: undefined })
    },
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    search,
    navigateTo,
    next: () => navigateTo((state.activeIndex ?? -1) + 1),
    previous: () => navigateTo((state.activeIndex ?? 0) - 1),
    replace: async () => false,
    replaceAll: () => 0,
  }
}

export const registerPreviewFind = (
  fileId: string,
  groupId: string | undefined,
  container: HTMLElement,
): (() => void) => {
  const key = keyFor(fileId, groupId)
  const existing = entries.get(key)
  if (existing?.container === container) return () => {}
  const api = createPreviewFind(container)
  entries.set(key, { container, api })
  return () => {
    if (entries.get(key)?.api === api) entries.delete(key)
  }
}

export const getPreviewFindApi = (fileId: string, groupId?: string): EditorFindApi | undefined =>
  entries.get(keyFor(fileId, groupId))?.api
