import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LucideIcon } from 'lucide-react'
import type { DesktopMenuItemData } from '@/stores/useContextMenuStore'
import type { ReactNode } from 'react'

export type ToolbarMenuEntry = {
  id: string
  label: string
  run: () => void
}

export type ToolbarAction = {
  id: string
  group: string
  priority: number
  label: string
  icon: LucideIcon
  pressed?: boolean
  disabled?: boolean
  /** Custom control instead of a button, for toolbar widgets with their own UI. */
  render?: () => ReactNode
  /** When present the button opens this list instead of running a single command. */
  items?: ToolbarMenuEntry[]
  run?: () => void
}

type ToolbarActionButtonProps = {
  action: ToolbarAction
}

export function ToolbarActionButton({ action }: ToolbarActionButtonProps) {
  const Icon = action.icon

  if (action.render) return <>{action.render()}</>

  if (action.items?.length) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label={action.label}
                data-toolbar-action={action.id}
                disabled={action.disabled}
                size='icon-chrome'
                variant='chrome'
              >
                <Icon aria-hidden='true' size={14} strokeWidth={1.75} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{action.label}</TooltipContent>
        </Tooltip>
        <PopoverContent align='start' className='w-auto min-w-40 p-1'>
          <div role='menu' aria-label={action.label} className='flex flex-col'>
            {action.items.map((entry) => (
              <button
                key={entry.id}
                type='button'
                role='menuitem'
                aria-label={entry.label}
                className='flex items-center gap-2 rounded-sm px-2 py-1 text-left text-ui-caption hover:bg-[var(--mf-ui-hover-bg)]'
                onClick={entry.run}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={action.label}
          aria-pressed={action.pressed}
          data-toolbar-action={action.id}
          disabled={action.disabled}
          onClick={action.run}
          size='icon-chrome'
          variant='chrome'
        >
          <Icon aria-hidden='true' size={14} strokeWidth={1.75} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{action.label}</TooltipContent>
    </Tooltip>
  )
}

export function getOverflowToolbarActions(
  actions: ToolbarAction[],
  hiddenGroupIds: ReadonlySet<string>,
): ToolbarAction[] {
  return actions.filter((action) => hiddenGroupIds.has(action.group))
}

export function toOverflowMenuItems(actions: ToolbarAction[]): DesktopMenuItemData[] {
  return actions.map((action) => ({
    checked: action.pressed,
    disabled: action.disabled,
    handler: action.run,
    label: action.label,
    value: `toolbar-${action.id}`,
  }))
}
