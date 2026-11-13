import { getExplorerStateStore } from '@/stores/useExplorerStateStore'
import { FileTree } from '@markflowy/interface'
import type { ContextMenuItem, FileTreeDeletionRequest, FileTreeOpenOptions } from '@markflowy/interface'
import type { IFile } from '@/helper/filesys'
import { dialog } from '@/services/dialog'
import { getUnsavedFileIds } from '@/services/checkUnsavedFiles'
import { useEditorStore } from '@/stores'
import { AsyncSurface } from '@/components/AsyncSurface'
import { logger } from '@/helper/logger'
import { refreshWorkspaceDirectory, useWorkspaceDirectoryState } from '@/services/workspace-refresh'
import useRepoStore from '@/stores/useRepoStore'
import { ensureRepoUnlocked } from '@/services/repo'
import {
  ChevronsUpIcon,
  EllipsisIcon,
  FolderIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  LocateFixedIcon,
  LockIcon,
  RefreshCwIcon,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyTitle } from '@/components/ui/empty'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import classNames from 'classnames'
import type { FC, MouseEventHandler } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { i18n, useTranslation } from '@/i18n'
import useNoteEncryptionStore, { noteKey } from '@/stores/useNoteEncryptionStore'
import { stripMarkdownExtension } from '@markflowy/interface'
import { useFileSystem } from '@markflowy/interface'
import { indexNoteCounts } from '@/stores/useNoteCountsStore'
import { scanNoteEncryption } from '@/services/noteEncryptionScan'
import useNoteCountsStore from '@/stores/useNoteCountsStore'
import useAppSettingStore from '@/stores/useAppSettingStore'
import { setNoteLockResolver } from '@/services/noteLockRegistry'
import { isNoteLocked } from '@/stores/useNoteEncryptionStore'
import { Container, EXPLORER_FILE_TREE_INDENT_SIZE, EXPLORER_FILE_TREE_ROW_HEIGHT } from './styles'
import { FillFlexParent } from '../fill-flex-parent'
import { showContextMenu } from '../ui-v2/ContextMenu'
import type { MfIconButtonProps } from '../ui-v2/Button'
import {
  getFileObject,
  getFileObjectByPath,
  setFileObject,
  setFileObjectByPath,
  deletePathEntry,
  deleteFileObjectsByIds,
  deleteFileObjectsByPathPrefix,
  getFileIdsByPathPrefix,
  getReplacementTargetIds,
  moveFileObjectsByPathPrefix,
} from '@/helper/files'
import useFileCacheStore from '@/helper/files'
import { fileTypeIcon } from '@/helper/fileTypeIcon'
import { useBookmarkStore } from '@/extensions/bookmarks/store'
import { BookmarkIcon } from 'lucide-react'
import { createFile, updateFile } from '@/helper/filesys'
import { createExplorerComparator } from './explorerSorting'
import { ExplorerSortMenu } from './ExplorerSortMenu'

const fileTreeActionIcons: Record<string, LucideIcon> = {
  'ri-collapse-vertical-fill': ChevronsUpIcon,
  'ri-focus-3-line': LocateFixedIcon,
  'ri-refresh-line': RefreshCwIcon,
}

function ExplorerFileTreeActionButton(props: MfIconButtonProps) {
  const Icon = fileTreeActionIcons[props.icon] ?? EllipsisIcon
  const accessibleName =
    props.ariaLabel ??
    (typeof props.tooltipProps?.title === 'string' ? props.tooltipProps.title : undefined)
  const button = (
    <Button
      aria-label={accessibleName}
      aria-pressed={typeof props.active === 'boolean' ? props.active : undefined}
      className={props.className}
      data-mf-chrome-icon-button=''
      disabled={props.disabled}
      onClick={(event) => props.onClick(event)}
      size='icon-chrome'
      variant='chrome'
    >
      <Icon aria-hidden='true' size={14} strokeWidth={1.75} />
    </Button>
  )

  if (!props.tooltipProps?.title) return button

  const { title, ...contentProps } = props.tooltipProps
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent {...contentProps}>{title}</TooltipContent>
    </Tooltip>
  )
}

setNoteLockResolver(
  (fileId) => useFileCacheStore.getState().entries[fileId]?.path,
  (path) => isNoteLocked(path),
)

function ExplorerFileIcon({
  file,
  state,
}: {
  file: IFile
  state: { isLoading: boolean; isOpen: boolean }
}) {
  if (state.isLoading) {
    return (
      <LoaderCircleIcon
        aria-hidden='true'
        className='animate-spin motion-reduce:animate-none'
        size={16}
        strokeWidth={1.75}
      />
    )
  }

  if (file.kind === 'dir') {
    const DirectoryIcon = state.isOpen ? FolderOpenIcon : FolderIcon
    return <DirectoryIcon aria-hidden='true' size={16} strokeWidth={1.75} />
  }

  const DocumentIcon = fileTypeIcon(file.ext ?? file.name)
  return <DocumentIcon aria-hidden='true' size={16} strokeWidth={1.75} />
}

/**
 * An encrypted note shows a lock where the page icon would be, and gets it back once the
 * note is decrypted. The state comes from the first bytes of each note, never from its body.
 */
function ExplorerNodeIcon({
  file,
  state,
}: {
  file: IFile
  state: { isLoading: boolean; isOpen: boolean }
}) {
  const encrypted = useNoteEncryptionStore((store) =>
    file.path ? store.encryptedPaths.includes(noteKey(file.path)) : false,
  )

  if (!state.isLoading && file.kind !== 'dir' && encrypted) {
    return (
      <LockIcon aria-label={i18n.t('encryption.locked.tab')} size={16} strokeWidth={1.75} />
    )
  }
  return <ExplorerFileIcon file={file} state={state} />
}

/** A solid ribbon for favourites: no shadow, no gap, drawn in the warning colour. */
function ExplorerNodePrefix({ file }: { file: IFile }) {
  const bookmarked = useBookmarkStore((store) => {
    if (!file.path || file.kind === 'dir') return false
    const key = noteKey(file.path)
    return store.library.items.some((item) => noteKey(item.target.path) === key)
  })

  if (!bookmarked) return null
  return (
    <BookmarkIcon
      aria-label={i18n.t('bookmarks.edit')}
      className='size-3 shrink-0 fill-current text-warning'
      strokeWidth={0}
    />
  )
}

function renderExplorerNodeIcon(file: IFile, state: { isLoading: boolean; isOpen: boolean }) {
  return <ExplorerNodeIcon file={file} state={state} />
}

type ExplorerFileTreePresentation = {
  renderNodeIcon: typeof renderExplorerNodeIcon
  renderNodePrefix: (file: IFile) => React.ReactNode
  renderNodeName: (file: IFile) => string
  stickyRoot: boolean
  indentSize: number
  rowHeight: number
}

const explorerFileTreePresentation = {
  renderNodePrefix: (file: IFile) => <ExplorerNodePrefix file={file} />,
  renderNodeIcon: renderExplorerNodeIcon,
  // Notes are listed by name: the owner never types or reads the .md extension.
  renderNodeName: (file: IFile) =>
    file.kind === 'file' ? stripMarkdownExtension(file.name) : file.name,
  stickyRoot: true,
  indentSize: EXPLORER_FILE_TREE_INDENT_SIZE,
  rowHeight: EXPLORER_FILE_TREE_ROW_HEIGHT,
} satisfies ExplorerFileTreePresentation

const Explorer: FC<ExplorerProps> = (props) => {
  const { t } = useTranslation()
  const folderData = useEditorStore((state) => state.folderData)
  const workspacePath = folderData?.[0]?.path ?? ''
  const directory = useWorkspaceDirectoryState()
  const directoryState = directory.root === folderData?.[0] ? directory.status : 'idle'
  const useExplorerState = getExplorerStateStore(workspacePath)
  const expandedPaths = useExplorerState((state) => state.expandedPaths)
  const onExpandedPathsChange = useExplorerState((state) => state.setExpandedPaths)
  const sortDirection = useExplorerState((state) => state.sortDirection)
  const setSortDirection = useExplorerState((state) => state.setSortDirection)
  const compareNodes = useMemo(() => createExplorerComparator(sortDirection), [sortDirection])
  const treePersistence = { expandedPaths, onExpandedPathsChange }
  const [dndRootElement, setDndRootElement] = useState<HTMLDivElement | null>(null)

  const { readSubdirectory } = useFileSystem()
  const blockedRootPath = useRepoStore((state) => state.blockedRoot)
  const currentRoot = useEditorStore((state) => state.folderData?.[0]?.path)
  const normalizeRoot = (value: string | null | undefined) =>
    (value ?? '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '')
  // Only the workspace on screen can be blocked; a stale marker must not hide another folder.
  const blockedRoot = normalizeRoot(blockedRootPath) === normalizeRoot(currentRoot) ? blockedRootPath : null
  // Folder children loading must not restart the index: it would reset the numbers.
  const readSubdirectoryRef = useRef(readSubdirectory)
  readSubdirectoryRef.current = readSubdirectory

  // Which notes are encrypted, decided once per workspace: a lock must be right at startup,
  // not only after a click reveals it.
  useEffect(() => {
    if (!workspacePath) return
    let stale = false
    void scanNoteEncryption(workspacePath, (path) => readSubdirectoryRef.current(path), () => stale)
    return () => {
      stale = true
    }
  }, [workspacePath])

  const showNoteCounts = Boolean(
    useAppSettingStore((state) => state.settingData.show_note_counts),
  )
  const indexedCounts = useNoteCountsStore((state) => state.byPath)

  // Exact numbers need every directory read once; the tree alone only knows what was opened.
  // The tree changing (a note created, removed or renamed anywhere) is what triggers a new
  // pass, so the numbers follow the workspace instead of waiting for a restart.
  useEffect(() => {
    if (!showNoteCounts || !workspacePath) return
    const store = useNoteCountsStore.getState()
    const revision = store.revision + 1
    store.beginIndex(revision)
    let stale = false
    const timer = window.setTimeout(
      () => {
        void indexNoteCounts(workspacePath, (path) => readSubdirectoryRef.current(path), () => stale).then(
          ({ byPath, total }) => {
            if (stale) return
            useNoteCountsStore.getState().finishIndex(revision, byPath, total)
          },
        )
      },
      folderData ? 200 : 0,
    )
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [folderData, showNoteCounts, workspacePath])

  const presentation = useMemo<ExplorerFileTreePresentation>(
    () => ({
      ...explorerFileTreePresentation,
      renderNodeName: (file: IFile) => {
        const label = file.kind === 'file' ? stripMarkdownExtension(file.name) : file.name
        if (!showNoteCounts) return label
        if (file.kind === 'file') return label
        const count = file.path ? indexedCounts.get(file.path.toLowerCase()) ?? 0 : 0
        return `${label} (${count})`
      },
    }),
    [indexedCounts, showNoteCounts],
  )

  const handleOpen = useCallback((item: IFile, options: FileTreeOpenOptions) => {
    if (item?.kind !== 'file') return
    const editor = useEditorStore.getState()
    const group = editor.getActiveGroup()
    if (!group) return

    // The note pane itself asks for the passphrase when the content is still ciphertext;
    // asking here too would stack dialogs.
    editor.openFileInGroup(group.id, item.id, options)
  }, [])

  const handleContextMenu: MouseEventHandler = useCallback((e) => e.preventDefault(), [])

  const handleShowConfirm = useCallback(
    async ({ title, onConfirm }: { title: string; onConfirm: () => void }) => {
      const action = await dialog.confirm({
        title,
        actions: [
          { id: 'cancel', label: t('common.cancel') },
          { id: 'confirm', label: t('common.confirm'), primary: true },
        ],
      })

      if (action === 'confirm') {
        onConfirm()
      }
    },
    [t],
  )

  const handleRequestDelete = useCallback(
    ({ file, mode, onConfirm }: FileTreeDeletionRequest) => {
      void dialog.confirmFileDeletion({ file, mode }).then(async (action) => {
        if (action === 'confirm') await onConfirm()
      }).catch((error: unknown) => logger.error('File deletion confirmation failed', error))
    },
    [],
  )

  const handleShowInputConfirm = useCallback(
    ({
      title,
      confirmText,
      cancelText,
      onConfirm,
      onClose,
    }: {
      title: string
      confirmText?: string
      cancelText?: string
      onConfirm: () => void
      onClose: () => void
    }) => {
      dialog
        .confirm({
          title,
          actions: [
            { id: 'cancel', label: cancelText ?? t('common.cancel') },
            { id: 'confirm', label: confirmText ?? t('common.confirm'), primary: true },
          ],
        })
        .then((action) => {
          if (action === 'confirm') {
            onConfirm()
            return
          }
          onClose()
        })
    },
    [t],
  )

  const handleShowContextMenu = useCallback(
    ({ x, y, items }: { x: number; y: number; items: ContextMenuItem[] }) => {
      showContextMenu({
        x,
        y,
        items,
      })
    },
    [],
  )

  const handleBeforeReplace = useCallback(
    async (path: string) => {
      const targetIds = await getReplacementTargetIds(path)
      const unsavedIds = getUnsavedFileIds(targetIds)
      if (unsavedIds.length === 0) return { allowed: true, targetIds }

      await dialog.info({
        title: t('confirm.close.title'),
        content: (
          <div>
            {t('confirm.close.description')}
            <div style={{ marginTop: '0.5em' }}>
              {unsavedIds.map((id) => (
                <div key={id}>{getFileObject(id)?.name}</div>
              ))}
            </div>
          </div>
        ),
      })
      return { allowed: false, targetIds }
    },
    [t],
  )

  const handleDeleteReplacedCache = useCallback((rootPath: string) => {
    const deletedIds = getFileIdsByPathPrefix(rootPath)
    const { delOpenedFile } = useEditorStore.getState()
    deletedIds.forEach((id) => delOpenedFile(id))
    deleteFileObjectsByPathPrefix(rootPath)
  }, [])

  const handleDeleteReplacedIds = useCallback((fileIds: string[]) => {
    const { delOpenedFile } = useEditorStore.getState()
    fileIds.forEach((id) => delOpenedFile(id))
    deleteFileObjectsByIds(fileIds)
  }, [])

  const containerCLs = classNames(props.className)
  const hasWorkspace = Boolean(folderData?.length)

  return (
    <Container className={containerCLs} onContextMenu={handleContextMenu}>
      <div className='min-h-0 w-full flex-1 overflow-hidden' ref={(ref) => setDndRootElement(ref)}>
        {blockedRoot ? (
          <AsyncSurface
            retryLabel={t('repo.unlock.action')}
            state={{
              status: 'error',
              title: t('repo.unlock.blocked_title'),
              description: t('repo.unlock.blocked_description'),
              retry: () => {
                void (async () => {
                  if (await ensureRepoUnlocked(blockedRoot)) await refreshWorkspaceDirectory()
                })()
              },
            }}
          >
            {() => null}
          </AsyncSurface>
        ) : directoryState === 'error' ? (
          <AsyncSurface
            retryLabel={t('common.retry')}
            state={{
              status: 'error',
              title: t('file.read_failed'),
              description: directory.error instanceof Error ? directory.error.message : undefined,
              retry: () => {
                void refreshWorkspaceDirectory().catch((error) => logger.error('Directory retry failed', error))
              },
            }}
          >
            {() => null}
          </AsyncSurface>
        ) : directoryState === 'loading' && !folderData?.[0]?.children?.length ? (
          <AsyncSurface state={{ status: 'loading', label: t('common.fetching') }}>
            {() => null}
          </AsyncSurface>
        ) : hasWorkspace ? (
          <FileTree
            key={workspacePath}
            {...presentation}
            {...treePersistence}
            data={folderData ?? []}
            compareNodes={compareNodes}
            rootActions={<ExplorerSortMenu direction={sortDirection} onDirectionChange={setSortDirection} />}
            onOpen={handleOpen}
            dndRootElement={dndRootElement as unknown as Node}
            fillFlexParentComponent={
              FillFlexParent as FC<{
                children: (dimens: { width: number; height: number }) => React.ReactNode
              }>
            }
            onShowConfirm={handleShowConfirm}
            onRequestDelete={handleRequestDelete}
            onShowInputConfirm={handleShowInputConfirm}
            onShowContextMenu={handleShowContextMenu}
            getFileObject={getFileObject}
            getFileObjectByPath={getFileObjectByPath}
            setFileObject={setFileObject}
            setFileObjectByPath={setFileObjectByPath}
            deletePathEntry={deletePathEntry}
            getFileIdsByPathPrefix={getFileIdsByPathPrefix}
            moveFileObjectsByPathPrefix={moveFileObjectsByPathPrefix}
            deleteFileObjectsByIds={handleDeleteReplacedIds}
            deleteFileObjectsByPathPrefix={handleDeleteReplacedCache}
            onBeforeReplace={handleBeforeReplace}
            createFile={createFile}
            updateFile={updateFile}
            iconButtonComponent={ExplorerFileTreeActionButton}
          />
        ) : (
          <Empty role='status'>
            <EmptyTitle>{t('workspace.none')}</EmptyTitle>
          </Empty>
        )}
      </div>
    </Container>
  )
}

interface ExplorerProps {
  className?: string
}

export default memo(Explorer)
