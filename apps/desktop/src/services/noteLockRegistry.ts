/**
 * Lets the view-mode guard ask "is this note locked?" without depending on the file cache
 * store: the store is installed by the app shell, and tests that never mount it keep the
 * guard inert instead of failing on a module mock.
 */
let resolvePath: (fileId: string) => string | undefined = () => undefined
let lockedLookup: (path: string) => boolean = () => false

export const setNoteLockResolver = (
  pathOf: (fileId: string) => string | undefined,
  isLocked: (path: string) => boolean,
): void => {
  resolvePath = pathOf
  lockedLookup = isLocked
}

export const isNoteLockedById = (fileId: string): boolean => {
  const path = resolvePath(fileId)
  return !!path && lockedLookup(path)
}
