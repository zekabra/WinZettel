import { InputGroup } from '@/components/ui/input-group'
import { useTranslation } from '@/i18n'
import useEditorStore from '@/stores/useEditorStore'
import usePreviewFindStore from '@/stores/usePreviewFindStore'
import { ChevronDownIcon, ChevronUpIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  findInPreview,
  paintPreviewMatches,
  scrollPreviewMatchIntoView,
  type PreviewMatch,
} from '../../preview/previewFind'

/**
 * Find for the reading pane, with its own state. It is deliberately not wired to the
 * editor's search store: both panes must be able to search at the same time with different
 * terms, and a shared owner slot made one close the other.
 */
interface PreviewFindBarProps {
  groupId?: string
  fileId?: string
}

export const PreviewFindBar = ({ groupId: scopedGroupId, fileId }: PreviewFindBarProps = {}) => {
  const { t } = useTranslation()
  const storeGroupId = useEditorStore((state) => state.activeGroupId)
  const storeFileId = useEditorStore((state) => state.activeId)
  const groupId = scopedGroupId ?? storeGroupId
  const activeId = fileId ?? storeFileId
  const open = usePreviewFindStore((state) => state.openGroups.includes(groupId ?? ''))
  const closeBar = usePreviewFindStore((state) => state.close)

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [matches, setMatches] = useState<PreviewMatch[]>([])

  const container = useMemo(() => {
    if (!open || !activeId) return null
    return document.querySelector<HTMLElement>(
      `[data-editor-active='true'][data-editor-id='${activeId}']`,
    )
  }, [open, activeId, query])

  useEffect(() => {
    if (!open) {
      paintPreviewMatches([], 0)
      setMatches([])
      return
    }
    if (!container) return
    const found = findInPreview(container, query)
    setMatches(found)
    setActiveIndex(0)
    paintPreviewMatches(found, 0)
    scrollPreviewMatchIntoView(found[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, container])

  // Closing or switching notes leaves nothing behind: the term is not reused.
  useEffect(() => {
    if (!open) return
    return () => {
      paintPreviewMatches([], 0)
      setQuery('')
      setMatches([])
      setActiveIndex(0)
    }
  }, [open])

  useEffect(() => {
    setQuery('')
    setMatches([])
    setActiveIndex(0)
    paintPreviewMatches([], 0)
  }, [activeId])

  if (!open) return null

  const move = (step: number) => {
    if (matches.length === 0) return
    const next = (activeIndex + step + matches.length) % matches.length
    setActiveIndex(next)
    paintPreviewMatches(matches, next)
    scrollPreviewMatchIntoView(matches[next])
  }

  const counter = t('find_replace.result_count', {
    current: matches.length ? activeIndex + 1 : 0,
    total: matches.length,
  })

  return (
    <div data-slot='preview-find' className='shrink-0 bg-background p-2 text-foreground'>
      <div className='flex min-w-0 flex-wrap items-center justify-end gap-1'>
        <div className='min-w-0 flex-[1_1_12rem]'>
          <InputGroup.Root className='h-7'>
            <InputGroup.Input
              aria-label={t('find_replace.find')}
              autoFocus
              className='h-full'
              inputSize='sm'
              placeholder={t('find_replace.find')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return
                if (event.key === 'Enter') {
                  event.preventDefault()
                  move(event.shiftKey ? -1 : 1)
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  closeBar(groupId)
                }
              }}
            />
            <InputGroup.Addon align='inline-end' className='min-w-12 justify-center border-l-0 tabular-nums'>
              {counter}
            </InputGroup.Addon>
          </InputGroup.Root>
        </div>
        <button
          type='button'
          aria-label={t('find_replace.previous_match')}
          className='inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-[var(--mf-ui-hover-bg)] disabled:opacity-40'
          disabled={matches.length === 0}
          onClick={() => move(-1)}
        >
          <ChevronUpIcon aria-hidden='true' className='size-4' />
        </button>
        <button
          type='button'
          aria-label={t('find_replace.next_match')}
          className='inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-[var(--mf-ui-hover-bg)] disabled:opacity-40'
          disabled={matches.length === 0}
          onClick={() => move(1)}
        >
          <ChevronDownIcon aria-hidden='true' className='size-4' />
        </button>
        <button
          type='button'
          aria-label={t('find_replace.close')}
          className='inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-[var(--mf-ui-hover-bg)]'
          onClick={() => closeBar(groupId)}
        >
          <XIcon aria-hidden='true' className='size-4' />
        </button>
      </div>
    </div>
  )
}
