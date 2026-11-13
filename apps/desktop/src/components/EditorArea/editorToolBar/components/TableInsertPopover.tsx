import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslation } from '@/i18n'
import { TableIcon } from 'lucide-react'
import { executeSourceCommand } from './sourceCommandBridge'

interface TableInsertPopoverProps {
  editorId?: string
}

/** Asks for the shape before inserting, instead of guessing preset sizes. */
export const TableInsertPopover = ({ editorId }: TableInsertPopoverProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [columns, setColumns] = useState('3')
  const [rows, setRows] = useState('3')

  const insert = () => {
    const cols = Number.parseInt(columns, 10)
    const body = Number.parseInt(rows, 10)
    executeSourceCommand(editorId, 'insertTable', {
      columns: Number.isFinite(cols) ? cols : 3,
      rows: Number.isFinite(body) ? body : 3,
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('toolbar.table')}
          data-toolbar-action='table'
          size='icon-chrome'
          variant='chrome'
        >
          <TableIcon aria-hidden='true' size={14} strokeWidth={1.75} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-56 p-2'>
        <div className='flex flex-col gap-2'>
          <label className='flex items-center justify-between gap-2 text-ui-caption'>
            {t('toolbar.table_columns')}
            <Input
              autoFocus
              className='w-16'
              inputSize='sm'
              min={1}
              max={12}
              type='number'
              value={columns}
              onChange={(event) => setColumns(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') insert()
              }}
            />
          </label>
          <label className='flex items-center justify-between gap-2 text-ui-caption'>
            {t('toolbar.table_rows')}
            <Input
              className='w-16'
              inputSize='sm'
              min={1}
              max={20}
              type='number'
              value={rows}
              onChange={(event) => setRows(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') insert()
              }}
            />
          </label>
          <div className='flex justify-end'>
            <Button size='sm' onClick={insert}>
              {t('toolbar.table_insert')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
