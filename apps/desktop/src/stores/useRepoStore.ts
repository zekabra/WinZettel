import { create } from 'zustand'

interface RepoState {
  /** The folder of the repository that is currently open, if any. */
  root: string | null
  /** True while a repository volume is unlocked in the backend. */
  isUnlocked: boolean
  /** A repository folder the tree tried to read while locked, so the UI can offer to unlock. */
  blockedRoot: string | null
  setUnlocked: (root: string) => void
  setBlocked: (root: string) => void
  clear: () => void
}

/**
 * What the UI needs to know about the open workspace being an encrypted repository.
 *
 * The backend remains the source of truth; this mirrors it so menus and settings can hide
 * choices that do not apply while a repository is open.
 */
const useRepoStore = create<RepoState>((set) => ({
  root: null,
  isUnlocked: false,
  blockedRoot: null,
  setUnlocked: (root) => set({ root, isUnlocked: true, blockedRoot: null }),
  setBlocked: (root) => set({ blockedRoot: root, isUnlocked: false }),
  clear: () => set({ root: null, isUnlocked: false, blockedRoot: null }),
}))

export const isRepoUnlocked = (): boolean => useRepoStore.getState().isUnlocked

export default useRepoStore
