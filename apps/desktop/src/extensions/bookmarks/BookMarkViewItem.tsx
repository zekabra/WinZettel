import { Badge } from '@/components/ui/badge'
import { stripNoteExtension } from '@/helper/noteName'
import type { Bookmark } from './types'

interface BookMarkViewItemProps {
  bookmark: Bookmark
  onClick: (bookmark: Bookmark) => void
  showTags?: boolean
}

export const BookMarkViewItem = (props: BookMarkViewItemProps) => {
  const { bookmark, onClick, showTags = true } = props

  const handleClick = () => onClick(bookmark)

  return (
    <button
      aria-label={stripNoteExtension(bookmark.title)}
      className='bookmark-list__item'
      data-bookmark-id={bookmark.id}
      onClick={handleClick}
      type='button'
    >
      <span className='bookmark-list__title'>{stripNoteExtension(bookmark.title)}</span>
      {showTags && bookmark.tags.length > 0 ? (
        <span className='bookmark-list__tags'>
          {bookmark.tags.map((tag) => (
            <Badge
              className='rounded-sm px-1 py-0 text-ui-caption font-normal'
              key={tag}
              size='sm'
              variant='outline'
            >
              {tag}
            </Badge>
          ))}
        </span>
      ) : null}
    </button>
  )
}
