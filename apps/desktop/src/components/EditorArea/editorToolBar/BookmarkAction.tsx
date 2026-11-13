import { commandRegistry } from '@/commands'
import { getFileObject } from '@/helper/files'
import { noteKey } from '@/stores/useNoteEncryptionStore'
import { useEffect, useMemo } from 'react'
import { useTranslation } from '@/i18n'
import { BookmarkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { loadBookmarkLibrary, useBookmarkStore } from '@/extensions/bookmarks/store'
import type { Bookmark } from '@/extensions/bookmarks/types'

/** One place decides whether a file is a favourite, so both toolbars agree. */
export const useFileBookmark = (fileId?: string): { bookmark?: Bookmark; loaded: boolean } => {
  const items = useBookmarkStore((state) => state.library.items)
  const loadStatus = useBookmarkStore((state) => state.loadStatus)
  const path = fileId ? getFileObject(fileId)?.path : undefined

  const bookmark = useMemo(() => {
    if (!path) return undefined
    const key = noteKey(path)
    return items.find((item) => noteKey(item.target.path) === key)
  }, [items, path])

  return { bookmark, loaded: loadStatus === 'ready' }
}

interface BookmarkActionProps {
  editorId?: string
}

/**
 * Favourites for the open note: outline when it is not one, filled when it is.
 *
 * Creating and editing both go through the dialog registered by `BookMarkDialog`, so the
 * library has a single writer.
 */
export const BookmarkAction = ({ editorId }: BookmarkActionProps) => {
  const { t } = useTranslation()
  const { bookmark, loaded } = useFileBookmark(editorId)

  useEffect(() => {
    if (!loaded) void loadBookmarkLibrary()
  }, [loaded])

  const open = () => {
    const file = editorId ? getFileObject(editorId) : undefined
    if (!file?.path) return
    if (bookmark) {
      commandRegistry.execute('edit_bookmark_dialog', bookmark)
      return
    }
    commandRegistry.execute('open_bookmark_dialog', { path: file.path, name: file.name })
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={bookmark ? t('bookmarks.edit') : t('bookmarks.add')}
          aria-pressed={Boolean(bookmark)}
          data-mf-bookmarked={bookmark ? '' : undefined}
          data-toolbar-action='bookmark'
          onClick={open}
          size='icon-chrome'
          variant='chrome'
        >
          <BookmarkIcon
            aria-hidden='true'
            className={bookmark ? 'fill-current text-warning' : undefined}
            size={14}
            strokeWidth={1.75}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{bookmark ? t('bookmarks.edit') : t('bookmarks.add')}</TooltipContent>
    </Tooltip>
  )
}
