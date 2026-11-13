import { commandRegistry } from '@/commands'
import { EditorViewType } from '@/constants/editorViewType'
import { getHeadingValue } from '@/helper/string'
import { useEditorStore } from '@/stores'
import useEditorViewTypeStore from '@/stores/useEditorViewTypeStore'
import useFileTypeConfigStore from '@/stores/useFileTypeConfigStore'
import useLayoutStore from '@/stores/useLayoutStore'
import { TableOfContents } from '@markflowy/interface'
import type { IHeadingData, TableOfContentsRef } from '@markflowy/interface'
import { t } from '@/i18n'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { DropdownMenuItemPrimitive } from '@/components/ui/dropdown-menu'
import { useCommandShortcut } from '@/commands/useCommandShortcut'
import { DockPanelMenu } from '@/components/SideBar/DockPanelMenu'
import { ListIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeDesc } from '@codemirror/state'
import type { MfCodemirrorView } from 'rme'
import { getLoadedRmeRuntime, type RmeRuntime } from '../EditorArea/rmeRuntime'
import {
  sourceCodeCodemirrorViewMap,
  subscribeSourceCodeEditors,
} from '../EditorArea/sourceCodeEditorRegistry'
import SideBarHeader from '../SideBar/SideBarHeader'
import { renderHeadingTitle } from './HeadingTitle'
import { TocViewContainer } from './styles'
import { subscribeOutlineScrollIntent, subscribeSourceOutline } from './outlineTracking'
import { listPreviewHeadings } from './previewOutline'
import { getOutlineSession, releaseOutlineSession, type OutlineSession, type OutlineSnapshot } from './outlineSession'
import { OUTLINE_COLLAPSE_ALL, OUTLINE_EXPAND_ALL, registerOutlineCommands } from './outlineCommands'

const emptyOutlineSnapshot: OutlineSnapshot = { collapsedIds: new Set(), headingCount: 0 }

function acquireOutlineSession(owner: object, fileId: string, mode: string, source: MfCodemirrorView) {
  const session = getOutlineSession(owner, fileId, mode, source)
  session.watchLifetime((listener) => {
    const unsubscribeEditor = subscribeSourceCodeEditors(listener)
    const unsubscribeMode = useEditorViewTypeStore.subscribe?.(listener)
    return () => { unsubscribeEditor(); unsubscribeMode?.() }
  }, () => useEditorViewTypeStore.getState().editorViewTypeMap.get(fileId) === mode &&
    sourceCodeCodemirrorViewMap.get(fileId) === owner,
  () => releaseOutlineSession(owner))
  return session
}

type SourceHeadingInfo = {
  pos: number
  depth: number
  value: string
  id: string
}

type HeadingViewportCoords = {
  top: number
  bottom?: number
}

const isMarkdownFile = (id: string) =>
  useFileTypeConfigStore.getState().fileTypeConfigMap.get(id)?.type === 'markdown'

const getHeadingChapterData = (
  headings: readonly { depth: number; value: string }[],
  runtime: RmeRuntime,
): { chapter?: string; value: string }[] => {
  const { analyzeHeadingNumbering } = runtime as RmeRuntime & {
    analyzeHeadingNumbering: (inputs: readonly { level: number; text: string }[]) => {
      complete: boolean
      entries: { prefix: string | null; title: string }[]
    }
  }
  const analysis = analyzeHeadingNumbering(
    headings.map((heading) => ({ level: heading.depth, text: heading.value })),
  )

  if (!analysis.complete) {
    return headings.map((heading) => ({ value: heading.value }))
  }

  return analysis.entries.map((entry) => ({
    chapter: entry.prefix ?? undefined,
    value: entry.title,
  }))
}

const getActiveEditorScrollEl = (activeId: string): HTMLElement | null => {
  const activeEditor =
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-editor-active="true"][data-editor-id]'),
    ).find((element) => element.dataset.editorId === activeId) ?? null

  return (
    (activeEditor?.querySelector('[data-overlayscrollbars-viewport]') as HTMLElement | null) ||
    (activeEditor?.querySelector('.os-viewport') as HTMLElement | null) ||
    activeEditor
  )
}

const resolveSourceScrollEl = (activeId: string, codemirrorScrollEl: HTMLElement) => {
  if (codemirrorScrollEl.scrollHeight > codemirrorScrollEl.clientHeight + 1) {
    return codemirrorScrollEl
  }

  return getActiveEditorScrollEl(activeId) ?? codemirrorScrollEl
}

const resolveActiveHeadingId = (params: {
  headings: { pos: number; id: string }[]
  scrollEl: HTMLElement | null
  getCoords: (pos: number) => HeadingViewportCoords | null
  offset?: number
}): string | null => {
  const { headings, scrollEl, getCoords, offset = 16 } = params
  if (!scrollEl || headings.length === 0) {
    return null
  }

  const containerRect = scrollEl.getBoundingClientRect()
  const viewportTop = containerRect.top + offset
  const viewportBottom = containerRect.bottom
  let currentId: string | null = headings[0]?.id ?? null
  let firstVisibleId: string | null = null

  for (const heading of headings) {
    try {
      const coords = getCoords(heading.pos)
      if (!coords) {
        continue
      }

      const headingTop = coords.top
      const headingBottom = coords.bottom ?? coords.top
      const isVisible = headingBottom >= viewportTop && headingTop <= viewportBottom

      if (isVisible) {
        firstVisibleId = heading.id
        break
      }

      if (headingTop < viewportTop) {
        currentId = heading.id
      } else {
        break
      }
    } catch (error) {
      continue
    }
  }

  return firstVisibleId ?? currentId
}

type TocViewProps = {
  variant?: 'sidebar' | 'editor'
}

export const TocView = ({ variant = 'sidebar' }: TocViewProps) => {
  const tocRef = useRef<TableOfContentsRef>(null)
  const tocHeadingsRef = useRef<IHeadingData[]>([])
  const showGeneratedNumbers = useLayoutStore((state) => state.showOutlineGeneratedNumbers)
  const refreshTocHeadings = useCallback((headings: IHeadingData[]) => {
    tocHeadingsRef.current = headings
    // An undefined chapter uses the generated number. Explicit chapters came from the document.
    tocRef.current?.refreshByHeadings({
      newHeadings: useLayoutStore.getState().showOutlineGeneratedNumbers
        ? headings
        : headings.map((heading) =>
            heading.chapter === undefined ? { ...heading, chapter: null } : heading,
          ),
    })
  }, [])
  const [outlineSession, setOutlineSession] = useState<OutlineSession | null>(null)
  const outlineSessionRef = useRef<OutlineSession | null>(null)
  const outlineSnapshot = useSyncExternalStore(
    useCallback((listener) => outlineSession?.subscribe(listener) ?? (() => {}), [outlineSession]),
    useCallback(() => outlineSession?.getSnapshot() ?? emptyOutlineSnapshot, [outlineSession]),
  )
  const collapseShortcut = useCommandShortcut(OUTLINE_COLLAPSE_ALL)
  const expandShortcut = useCommandShortcut(OUTLINE_EXPAND_ALL)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const [editorPanelEl, setEditorPanelEl] = useState<HTMLElement | null>(null)
  const sourceHeadingsRef = useRef<SourceHeadingInfo[]>([])
  const sourceOutlineRef = useRef<{
    id: string
    editor: MfCodemirrorView
    changes: ChangeDesc | null
  } | null>(null)
  const [sourceOutlineEditor, setSourceOutlineEditor] = useState<MfCodemirrorView | null>(null)
  const activeHeadingSourceRef = useRef<'viewport' | 'selection'>('viewport')
  const headingIntentRef = useRef(0)
  const sourceScrollElRef = useRef<HTMLElement | null>(null)
  const [sourceScrollEl, setSourceScrollEl] = useState<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const sourceRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleActiveHeadingUpdateRef = useRef<() => void>(() => {})
  const activeId = useEditorStore((state) => state.activeId)
  const activeIsMarkdown = useFileTypeConfigStore(
    (state) => state.fileTypeConfigMap.get(activeId ?? '')?.type === 'markdown',
  )
  const activeViewType = useEditorViewTypeStore((state) =>
    activeId ? state.editorViewTypeMap.get(activeId) : undefined,
  )
  const getSourceSnapshot = useCallback(
    () => (activeId && activeIsMarkdown ? sourceCodeCodemirrorViewMap.get(activeId) : undefined),
    [activeId, activeIsMarkdown],
  )
  const sourceEditor = useSyncExternalStore(
    subscribeSourceCodeEditors,
    getSourceSnapshot,
    getSourceSnapshot,
  )

  useEffect(() => {
    activeHeadingSourceRef.current = 'viewport'
    headingIntentRef.current++
  }, [activeId, activeViewType, sourceEditor])

  useEffect(() => () => {
    if (!activeId) return
    const mode = useEditorViewTypeStore.getState().editorViewTypeMap.get(activeId)
    if (sourceEditor && (mode !== activeViewType || sourceCodeCodemirrorViewMap.get(activeId) !== sourceEditor)) {
      releaseOutlineSession(sourceEditor)
    }
  }, [activeId, activeViewType, sourceEditor])

  const clearOutline = useCallback(() => {
    if (sourceRefreshTimerRef.current !== null) {
      clearTimeout(sourceRefreshTimerRef.current)
      sourceRefreshTimerRef.current = null
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    refreshTocHeadings([])
    outlineSessionRef.current = null
    setOutlineSession(null)
    setActiveHeadingId(null)
    sourceHeadingsRef.current = []
    sourceOutlineRef.current = null
    setSourceOutlineEditor(null)
    activeHeadingSourceRef.current = 'viewport'
    headingIntentRef.current++
    sourceScrollElRef.current = null
    setSourceScrollEl(null)
  }, [refreshTocHeadings])

  useEffect(() => registerOutlineCommands({
    isCurrent: () => {
      const id = useEditorStore.getState().activeId
      if (!id || !isMarkdownFile(id)) return false
      const mode = useEditorViewTypeStore.getState().editorViewTypeMap.get(id)
      const session = outlineSessionRef.current
      if (!session || session.fileId !== id || session.mode !== mode || !session.getSnapshot().headingCount) return false
      if (mode === EditorViewType.SOURCECODE) {
        const outline = sourceOutlineRef.current
        return outline?.id === id && outline.editor === sourceCodeCodemirrorViewMap.get(id)
      }
      return false
    },
    collapseAll: () => tocRef.current?.collapseAll(),
    expandAll: () => tocRef.current?.expandAll(),
  }), [])

  const calculateActiveHeadingId = useCallback(() => {
    const currentActiveId = useEditorStore.getState().activeId
    if (!currentActiveId || !isMarkdownFile(currentActiveId)) return null

    const editorViewTypeMap = useEditorViewTypeStore.getState().editorViewTypeMap
    const viewType = editorViewTypeMap.get(currentActiveId)

    if (viewType === EditorViewType.SOURCECODE) {
      const codemirrorView = sourceCodeCodemirrorViewMap.get(currentActiveId)
      const outline = sourceOutlineRef.current
      if (!codemirrorView || outline?.id !== currentActiveId || outline.editor !== codemirrorView) {
        return null
      }
      const position = (pos: number) => outline.changes?.mapPos(pos, 1) ?? pos
      if (activeHeadingSourceRef.current === 'selection') {
        const head = codemirrorView.cm.state.selection.main.head
        const headings = sourceHeadingsRef.current
        let start = 0
        let end = headings.length
        while (start < end) {
          const middle = (start + end) >>> 1
          if (position(headings[middle].pos) <= head) start = middle + 1
          else end = middle
        }
        return headings[start - 1]?.id ?? null
      }

      return resolveActiveHeadingId({
        headings: sourceHeadingsRef.current,
        scrollEl: sourceScrollElRef.current,
        getCoords: (pos) => {
          const cmEditorEl = codemirrorView.cm.dom
          if (!cmEditorEl) {
            return null
          }

          const lineBlock = codemirrorView.cm.lineBlockAt(position(pos))
          const viewportEl = sourceScrollElRef.current
          const baseRect =
            viewportEl === codemirrorView.cm.scrollDOM
              ? codemirrorView.cm.scrollDOM.getBoundingClientRect()
              : cmEditorEl.getBoundingClientRect()
          const cmScrollTop = codemirrorView.cm.scrollDOM.scrollTop

          return {
            top: baseRect.top + lineBlock.top - cmScrollTop,
            bottom: baseRect.top + lineBlock.bottom - cmScrollTop,
          }
        },
      })
    }

    return null
  }, [])

  const updateActiveHeadingId = useCallback(() => {
    const nextActiveId = calculateActiveHeadingId()
    setActiveHeadingId((currentActiveId) =>
      currentActiveId === nextActiveId ? currentActiveId : nextActiveId,
    )
  }, [calculateActiveHeadingId])

  const scheduleActiveHeadingUpdate = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      updateActiveHeadingId()
    })
  }, [updateActiveHeadingId])

  useEffect(() => {
    scheduleActiveHeadingUpdateRef.current = scheduleActiveHeadingUpdate
  }, [scheduleActiveHeadingUpdate])

  useEffect(() => {
    const disposable = commandRegistry.registerCommand({
      id: 'app:toc_refresh',
      handler: () => {
        if (sourceRefreshTimerRef.current !== null) {
          clearTimeout(sourceRefreshTimerRef.current)
          sourceRefreshTimerRef.current = null
        }
        const currentActiveId = useEditorStore.getState().activeId
        const editorViewTypeMap = useEditorViewTypeStore.getState().editorViewTypeMap

        // Preview and Source Code modes are also used by non-Markdown files.
        // Only the active file's classification grants outline ownership.
        if (!currentActiveId || !isMarkdownFile(currentActiveId)) {
          clearOutline()
          return
        }

        const viewType = editorViewTypeMap.get(currentActiveId)

        // Preview has no editor-side heading tree; the rendered headings are the outline.
        if (viewType !== EditorViewType.SOURCECODE) {
          outlineSessionRef.current = null
          setOutlineSession(null)
          setActiveHeadingId(null)
          refreshTocHeadings(listPreviewHeadings(currentActiveId))
          return
        }

        if (viewType === EditorViewType.SOURCECODE) {
          const codemirrorView = sourceCodeCodemirrorViewMap.get(currentActiveId)
          if (!codemirrorView) {
            // TextEditor publishes another refresh when CodeMirror finishes
            // loading. Avoid an unowned retry loop after a tab closes or its
            // mode changes.
            return
          }

          sourceRefreshTimerRef.current = setTimeout(() => {
            sourceRefreshTimerRef.current = null
            if (
              useEditorStore.getState().activeId !== currentActiveId ||
              !isMarkdownFile(currentActiveId) ||
              useEditorViewTypeStore.getState().editorViewTypeMap.get(currentActiveId) !==
                EditorViewType.SOURCECODE ||
              sourceCodeCodemirrorViewMap.get(currentActiveId) !== codemirrorView
            ) {
              return
            }
            // A registered source view has already loaded the engine.
            const runtime = getLoadedRmeRuntime()
            if (!runtime) return
            const matches = runtime.extractMatches(codemirrorView.cm)
            const sourceHeadings: SourceHeadingInfo[] = matches.map((match) => {
              const depth = Number(match.type.split('ATXHeading')?.[1]) || 1
              const value = getHeadingValue(match.value)
              const pos = match.from

              return {
                depth,
                value,
                pos,
                id: `heading-${pos}`,
              }
            })

            sourceHeadingsRef.current = sourceHeadings
            sourceOutlineRef.current = {
              id: currentActiveId,
              editor: codemirrorView,
              changes: null,
            }
            setSourceOutlineEditor(codemirrorView)
            const chapterData = getHeadingChapterData(sourceHeadings, runtime)
            const nextScrollEl = resolveSourceScrollEl(currentActiveId, codemirrorView.cm.scrollDOM)
            sourceScrollElRef.current = nextScrollEl
            setSourceScrollEl(nextScrollEl)

            const headings: IHeadingData[] = sourceHeadings.map((heading, index) => {
              return {
                depth: heading.depth,
                value: chapterData[index]?.value ?? heading.value,
                chapter: chapterData[index]?.chapter,
                id: heading.id,
                htmlNode: null,
                onClick: () => {
                  const outline = sourceOutlineRef.current
                  const pos =
                    outline?.editor === codemirrorView
                      ? (outline.changes?.mapPos(heading.pos, 1) ?? heading.pos)
                      : heading.pos
                  codemirrorView.cm.dispatch({
                    selection: {
                      anchor: pos,
                      head: pos,
                    },
                    scrollIntoView: true,
                  })
                  codemirrorView.cm.focus()
                  activeHeadingSourceRef.current = 'selection'
                  headingIntentRef.current++
                  scheduleActiveHeadingUpdateRef.current()
                },
              }
            })
            const session = acquireOutlineSession(codemirrorView, currentActiveId, EditorViewType.SOURCECODE, codemirrorView)
            session.refresh(headings, new Map(sourceHeadings.map((heading) => [heading.id, heading.pos])))
            outlineSessionRef.current = session
            setOutlineSession(session)
            refreshTocHeadings(headings)
            scheduleActiveHeadingUpdateRef.current()
          }, 0)
          return
        }

        clearOutline()
      },
    })

    return () => disposable.dispose()
  }, [clearOutline, refreshTocHeadings])

  useEffect(() => {
    const currentEditorPanelEl = document.querySelector('#editor-panel') as HTMLElement | null
    setEditorPanelEl(currentEditorPanelEl)
  }, [activeId, activeIsMarkdown])

  useEffect(() => {
    if (!sourceScrollEl) return

    const handleScroll = () => scheduleActiveHeadingUpdate()
    const currentActiveId = useEditorStore.getState().activeId
    const codemirrorView = currentActiveId ? sourceCodeCodemirrorViewMap.get(currentActiveId) : null
    const scrollTargets = Array.from(
      new Set([sourceScrollEl, codemirrorView?.cm.scrollDOM].filter(Boolean)),
    ) as HTMLElement[]

    scrollTargets.forEach((scrollTarget) => {
      scrollTarget.addEventListener('scroll', handleScroll, { passive: true })
    })
    const unsubscribeIntents = scrollTargets.map((target) =>
      subscribeOutlineScrollIntent(target, () => {
        activeHeadingSourceRef.current = 'viewport'
        headingIntentRef.current++
      }),
    )
    handleScroll()

    return () => {
      unsubscribeIntents.forEach((unsubscribe) => unsubscribe())
      scrollTargets.forEach((scrollTarget) => {
        scrollTarget.removeEventListener('scroll', handleScroll)
      })
    }
  }, [sourceScrollEl, sourceEditor, scheduleActiveHeadingUpdate])

  useEffect(() => {
    if (
      !activeId ||
      !activeIsMarkdown ||
      activeViewType !== EditorViewType.SOURCECODE ||
      !sourceEditor ||
      sourceOutlineEditor !== sourceEditor
    )
      return
    let disposed = false
    const unsubscribe = subscribeSourceOutline(sourceEditor, (update) => {
      if (
        disposed ||
        useEditorStore.getState().activeId !== activeId ||
        !isMarkdownFile(activeId) ||
        useEditorViewTypeStore.getState().editorViewTypeMap.get(activeId) !==
          EditorViewType.SOURCECODE ||
        sourceCodeCodemirrorViewMap.get(activeId) !== sourceEditor
      )
        return
      const outline = sourceOutlineRef.current
      if (update.docChanged && outline?.editor === sourceEditor) {
        outline.changes = outline.changes?.composeDesc(update.changes.desc) ?? update.changes.desc
      }
      if (
        update.view.hasFocus &&
        (update.docChanged || !update.startState.selection.eq(update.state.selection))
      ) {
        activeHeadingSourceRef.current = 'selection'
        headingIntentRef.current++
        scheduleActiveHeadingUpdate()
      }
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [
    activeId,
    activeIsMarkdown,
    activeViewType,
    sourceEditor,
    sourceOutlineEditor,
    scheduleActiveHeadingUpdate,
  ])

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      if (sourceRefreshTimerRef.current !== null) {
        clearTimeout(sourceRefreshTimerRef.current)
        sourceRefreshTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!activeId || !activeIsMarkdown) {
      clearOutline()
      return
    }
    const timer = setTimeout(() => {
      commandRegistry.execute('app:toc_refresh')
    }, 300)
    return () => clearTimeout(timer)
  }, [activeId, activeViewType, activeIsMarkdown, sourceEditor, clearOutline])

  const canFold = Boolean(activeIsMarkdown && outlineSession && outlineSession.fileId === activeId &&
    outlineSession.mode === activeViewType && outlineSnapshot.headingCount > 0)

  return (
    <TocViewContainer variant={variant}>
      <SideBarHeader
        actions={<>
          <DockPanelMenu panelId='toc'>
            <DropdownMenuItemPrimitive disabled={!canFold} onSelect={() => { void commandRegistry.execute(OUTLINE_COLLAPSE_ALL) }}>
              {t('sidebar.outline_collapse_all')}
              <span className='ml-auto pl-4 text-ui-caption text-muted-foreground'>{collapseShortcut}</span>
            </DropdownMenuItemPrimitive>
            <DropdownMenuItemPrimitive disabled={!canFold} onSelect={() => { void commandRegistry.execute(OUTLINE_EXPAND_ALL) }}>
              {t('sidebar.outline_expand_all')}
              <span className='ml-auto pl-4 text-ui-caption text-muted-foreground'>{expandShortcut}</span>
            </DropdownMenuItemPrimitive>
            <DropdownMenuItemPrimitive
              onSelect={() => {
                useLayoutStore.getState().toggleOutlineGeneratedNumbers()
                refreshTocHeadings(tocHeadingsRef.current)
              }}
            >
              {t(showGeneratedNumbers
                ? 'sidebar.outline_hide_generated_numbers'
                : 'sidebar.outline_show_generated_numbers')}
            </DropdownMenuItemPrimitive>
          </DockPanelMenu>
        </>}
        name={t('sidebar.table_of_contents')}
        title={t('sidebar.table_of_contents')}
      />
      <div
        style={{
          height: 'calc(100% - 32px)',
          boxSizing: 'border-box',
        }}
      >
        <TableOfContents
          ref={tocRef}
          renderTitle={renderHeadingTitle}
          containerEl={editorPanelEl ?? undefined}
          scrollEl={editorPanelEl ?? undefined}
          variant={variant}
          compact={false}
          pinned
          activeId={activeHeadingId ?? undefined}
          toolbarFixed
          collapsible
          collapsedHeadingIds={outlineSnapshot.collapsedIds}
          onCollapsedHeadingIdsChange={outlineSession?.setCollapsedIds}
          collapseLabel={t('sidebar.outline_collapse')}
          expandLabel={t('sidebar.outline_expand')}
          Empty={
            activeId ? (
              <Empty role='status'>
                <EmptyHeader>
                  <EmptyMedia>
                    <ListIcon aria-hidden='true' className='size-5' strokeWidth={1.5} />
                  </EmptyMedia>
                  <EmptyTitle>{t('sidebar.no_heading_lines')}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : null
          }
        />
      </div>
    </TocViewContainer>
  )
}
