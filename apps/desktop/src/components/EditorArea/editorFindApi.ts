/** Shared contract between the search UI and each editor surface's find implementation. */
export interface EditorFindMatch {
  from: number
  to: number
}

export interface EditorFindState {
  activeIndex?: number
  caseSensitive: boolean
  matches: readonly EditorFindMatch[]
  query: string
}

export interface EditorSourceMatchRequest {
  line: number
  startColumn: number
  endColumn: number
  lineText: string
  query: string
  caseSensitive?: boolean
}

export interface EditorSourceMatchResult {
  status: 'exact' | 'block' | 'stale' | 'not-found'
}

export interface EditorFindApi {
  searchAsync?: (
    request: { query: string; caseSensitive?: boolean; activeIndex?: number },
    options?: { signal?: AbortSignal },
  ) => Promise<EditorFindState | null>
  navigateTo?: (index: number, options?: { signal?: AbortSignal }) => Promise<unknown>
  revealSourceMatch?: (
    request: EditorSourceMatchRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<EditorSourceMatchResult | null>
  clear: () => EditorFindState
  close: () => EditorFindState
  getState: () => EditorFindState
  next: () => Promise<unknown>
  open: (options?: { replace?: boolean }) => EditorFindState
  previous: () => Promise<unknown>
  replace: (replacement: string) => Promise<boolean>
  replaceAll: (replacement: string) => number | Promise<number>
  search: (request: { activeIndex?: number; caseSensitive?: boolean; query: string }) => EditorFindState
  subscribe: (listener: (state: EditorFindState) => void) => () => void
}
