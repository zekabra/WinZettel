import { create } from 'zustand'
import { EditorViewType, type EditorViewTypeValue } from '@/constants/editorViewType'
import { immer } from 'zustand/middleware/immer'
import { isNoteLockedById } from '@/services/noteLockRegistry'
import { i18n } from '@/i18n'
import { notifyErrorOnce } from '@/services/notifyOnce'
import { logger } from '@/helper/logger'

/**
 * A note still in ciphertext must not reach the editor: changing the blob leaves a note that
 * can no longer be decrypted. The guard lives here because every switcher (button, keyboard,
 * command palette) goes through this setter.
 */
const refusesSourceMode = (id: string, viewType: EditorViewTypeValue): boolean => {
  if (viewType !== EditorViewType.SOURCECODE) return false
  if (!isNoteLockedById(id)) return false
  logger.info('Refused the editor for a locked note:', id)
  // Both panes can reach this while resolving their mode; the owner reads it once.
  notifyErrorOnce(
    'encryption.locked.editor_blocked',
    i18n.t('encryption.locked.editor_blocked'),
  )
  // Leaving focus on a control that no longer applies paints a focus ring over the pane.
  if (typeof document !== 'undefined') {
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
  }
  return true
}

const useEditorViewTypeStore = create(
  immer<EditorViewTypeStore>((set, get) => {
    return {
      editorViewTypeMap: new Map(),
      editorGroupViewTypeMap: new Map(),

      setEditorViewType: (id, viewType, groupId) => {
        if (refusesSourceMode(id, viewType)) return
        set((state) => {
          if (groupId) {
            const modes = state.editorGroupViewTypeMap.get(groupId) ?? new Map()
            modes.set(id, viewType)
            state.editorGroupViewTypeMap.set(groupId, modes)
          } else {
            state.editorViewTypeMap.set(id, viewType)
          }
        })
      },

      getEditorViewType: (id, groupId) =>
        selectEditorViewType(get(), id, groupId) ?? EditorViewType.PREVIEW,

      pruneGroupEditorViewTypes: (groups) => {
        if (!get().editorGroupViewTypeMap.size) return
        set((state) => {
          const openedByGroup = new Map(groups.map((group) => [group.id, new Set(group.opened)]))
          for (const [groupId, modes] of state.editorGroupViewTypeMap) {
            const opened = openedByGroup.get(groupId)
            for (const id of modes.keys()) {
              if (!opened?.has(id)) modes.delete(id)
            }
            if (!modes.size) state.editorGroupViewTypeMap.delete(groupId)
          }
        })
      },
    }
  }),
)

type EditorViewTypeStore = {
  /** Compatibility view for active-editor consumers and new pane defaults. */
  editorViewTypeMap: Map<string, EditorViewTypeValue>
  editorGroupViewTypeMap: Map<string, Map<string, EditorViewTypeValue>>
  setEditorViewType: (id: string, viewType: EditorViewTypeValue, groupId?: string) => void
  getEditorViewType: (id: string, groupId?: string) => EditorViewTypeValue
  pruneGroupEditorViewTypes: (groups: { id: string; opened: readonly string[] }[]) => void
}

export function selectEditorViewType(state: EditorViewTypeStore, id: string, groupId?: string) {
  return (groupId ? state.editorGroupViewTypeMap.get(groupId)?.get(id) : undefined) ??
    state.editorViewTypeMap.get(id)
}

export default useEditorViewTypeStore
