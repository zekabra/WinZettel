import { create } from 'zustand'

/**
 * Which reading panes have their find bar open. Kept per group so the source pane and the
 * reading pane can search at the same time, with different terms: the source search lives
 * in `editorSearchStore` and must not share a slot with this one.
 */
interface PreviewFindState {
  openGroups: string[]
  toggle: (groupId: string | undefined) => void
  close: (groupId: string | undefined) => void
}

const usePreviewFindStore = create<PreviewFindState>((set) => ({
  openGroups: [],
  toggle: (groupId = '') =>
    set((state) => ({
      openGroups: state.openGroups.includes(groupId)
        ? state.openGroups.filter((group) => group !== groupId)
        : [...state.openGroups, groupId],
    })),
  close: (groupId = '') =>
    set((state) => ({ openGroups: state.openGroups.filter((group) => group !== groupId) })),
}))

export default usePreviewFindStore
