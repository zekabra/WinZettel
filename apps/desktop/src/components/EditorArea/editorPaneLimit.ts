import type { EditorLayoutNode } from '@/stores/useEditorStore'

/** The work area splits once, into two panes: a second split would leave nowhere to work. */
const MAX_EDITOR_PANES = 2

export const countEditorPanes = (node: EditorLayoutNode): number =>
  node.type === 'leaf' ? 1 : node.children.reduce((total, child) => total + countEditorPanes(child), 0)

export const canSplitEditor = (node: EditorLayoutNode): boolean =>
  countEditorPanes(node) < MAX_EDITOR_PANES
