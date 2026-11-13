import { type FC } from 'react'
import type { EditorContext } from 'rme'
import { FindController } from './find-controller'
import { FindInput } from './find-input'
import { ReplaceController } from './replace-controller'
import { ReplaceInput } from './replace-input'
import { useFindReplace } from './use-find-replace'
import type { useEditorSearchController } from './use-editor-search'

export interface FindReplaceComponentProps {
  onDismiss?: () => void
  editorCtx: EditorContext
}

export const FindReplaceComponent: FC<FindReplaceComponentProps> = ({ onDismiss, editorCtx }) => {
  const controller = useFindReplace(editorCtx)
  return <FindReplaceControls controller={controller} onDismiss={onDismiss} />
}

type FindReplaceControlsProps = {
  allowReplace?: boolean
  controller: (
    | ReturnType<typeof useFindReplace>
    | ReturnType<typeof useEditorSearchController>
  ) & { setComposing?: (value: boolean) => void; dismiss?: () => void }
  onDismiss?: () => void
}

export function FindReplaceControls({
  controller,
  onDismiss,
  allowReplace = true,
}: FindReplaceControlsProps) {
  const {
    query,
    setQuery,
    activeIndex,
    total,
    caseSensitive,
    replacement,
    setReplacement,
    toggleCaseSensitive,
    findNext,
    findPrev,
    stopFind,
    replace,
    replaceAll,
  } = controller

  return (
    <div
      className='flex min-w-0 flex-col gap-2'
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return
        if (event.key === 'Escape') {
          event.preventDefault()
          // Dismissing on purpose drops the term; a pane transfer closes without clearing.
          controller.dismiss?.()
          stopFind()
          onDismiss?.()
        } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault()
          if (event.target.hasAttribute('data-mf-replace-input')) replace()
          else if (event.shiftKey) findPrev()
          else findNext()
        }
      }}
    >
      <div className='flex min-w-0 flex-wrap justify-end gap-1'>
        <div className='min-w-0 flex-[1_1_12rem]'>
          <FindInput
            query={query}
            setQuery={setQuery}
            total={total}
            activeIndex={activeIndex}
            setComposing={controller.setComposing}
          />
        </div>
        <FindController
          dismiss={controller.dismiss}
          findPrev={findPrev}
          findNext={findNext}
          toggleCaseSensitive={toggleCaseSensitive}
          caseSensitive={caseSensitive}
          stopFind={stopFind}
          onDismiss={onDismiss}
        />
      </div>
      {allowReplace ? (
        <div className='flex min-w-0 flex-wrap justify-end gap-1'>
          <div className='min-w-0 flex-[1_1_12rem]'>
            <ReplaceInput replacement={replacement} setReplacement={setReplacement} />
          </div>
          <ReplaceController replace={replace} replaceAll={replaceAll} />
        </div>
      ) : null}
    </div>
  )
}
