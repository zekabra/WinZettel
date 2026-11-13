import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslation } from '@/i18n'
import { LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSourceCodeEditor } from '../../sourceCodeEditorRegistry'

/** Markdown for the two fields. */
const buildLinkMarkdown = (text: string, url: string): string => {
  const safeText = text.trim() || url.trim()
  const safeUrl = url.trim()
  return safeUrl ? `[${safeText}](${safeUrl})` : safeText
}

interface LinkInsertPopoverProps {
  editorId?: string
}

/**
 * Two fields instead of pasting `[]()`: the caret keeps its place and the user writes the
 * label and the address.
 */
export const LinkInsertPopover = ({ editorId }: LinkInsertPopoverProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')

  const insert = () => {
    const editor = editorId ? getSourceCodeEditor(editorId) : undefined
    const markdown = buildLinkMarkdown(text, url)
    if (editor && markdown) {
      const { state } = editor.cm
      const selection = state.selection.main
      editor.cm.dispatch({
        changes: { from: selection.from, to: selection.to, insert: markdown },
        selection: { anchor: selection.from + markdown.length },
        scrollIntoView: true,
      })
      editor.cm.focus()
    }
    setText('')
    setUrl('')
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && editorId) {
          // Seed the label with what is selected, so wrapping a word needs one field.
          const editor = getSourceCodeEditor(editorId)
          const selection = editor?.cm.state.selection.main
          if (selection && selection.from !== selection.to) {
            setText(editor?.cm.state.sliceDoc(selection.from, selection.to) ?? '')
          }
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label={t('toolbar.link')}
          data-toolbar-action='link'
          size='icon-chrome'
          variant='chrome'
        >
          <LinkIcon aria-hidden='true' size={14} strokeWidth={1.75} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-64 p-2'>
        <div className='flex flex-col gap-2'>
          <label className='flex flex-col gap-1 text-ui-caption'>
            {t('toolbar.link_text')}
            <Input
              autoFocus
              inputSize='sm'
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') insert()
              }}
            />
          </label>
          <label className='flex flex-col gap-1 text-ui-caption'>
            {t('toolbar.link_url')}
            <Input
              inputSize='sm'
              placeholder='https://'
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') insert()
              }}
            />
          </label>
          <div className='flex justify-end'>
            <Button size='sm' onClick={insert}>
              {t('toolbar.link_insert')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
