import useFileTypeConfigStore from '@/stores/useFileTypeConfigStore'
import { useNoteIsLocked } from '../useLockedNote'

/**
 * Whether the editor toolbar must be inert for this pane.
 *
 * One rule for every reason a note cannot be edited: it is encrypted and still locked, or the
 * file format is not supported at all. Both toolbars read this, so a toolbar added later
 * inherits the behaviour instead of reinventing it.
 */
export const useToolbarDisabled = (editorId?: string): boolean => {
  const locked = useNoteIsLocked(editorId)
  const type = useFileTypeConfigStore((state) =>
    editorId ? state.fileTypeConfigMap.get(editorId)?.type : undefined,
  )

  return locked || type === 'unsupported'
}
