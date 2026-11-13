import { invoke } from '@tauri-apps/api/core'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { useEffect, useMemo, type FC, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import {
  AppContext,
  FileSystemContext,
  type AppContextValue,
  type FileSystemContextValue,
  type MoveFileInfo,
  type RunFileMutation,
} from '@markflowy/interface'
import { logger } from '@/helper/logger'
import { i18n } from '@/i18n'
import { decryptNoteFileWithPassphrase, encryptNoteFile } from '@/services/note-encryption'
import useNoteEncryptionStore, { isNoteEncrypted } from '@/stores/useNoteEncryptionStore'
import useRepoStore from '@/stores/useRepoStore'
import { useBookmarkStore } from '@/extensions/bookmarks/store'
import { commandRegistry } from '@/commands'
import { encryptNotesInFolder, setFolderReader } from '@/services/noteFolderEncryption'
import { dialog } from '@/services/dialog'
import { toast } from 'zens'
import { resolveFileExcludePatterns } from '@/helper/file-exclude'
import {
  FileResultCode,
  hydrateDirectoryEntries,
  unwrapDirectoryReadResult,
  type FileSysResult,
  type DirectoryReadEntry,
  type DirectoryReadResult,
  type IFile,
} from '@/helper/filesys'
import { useEditorStore } from '@/stores'
import useAppSettingStore from '@/stores/useAppSettingStore'
import { savePathCoordinator } from '@/components/EditorArea/savePathCoordinator'
import { copySavedFile, selectCopyDirectory } from './fileCopy'

interface FileSystemAdapterProps {
  children: ReactNode
}

const reportEncryptionResult = async (operation: () => Promise<void>, successKey: string) => {
  try {
    await operation()
    toast.success(i18n.t(successKey))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

const buildDesktopAppContext = (repoUnlocked: boolean): AppContextValue => ({
  copyText: writeText,
  // The tree hides "Encrypt note" once the note carries the marker.
  isNoteEncrypted: (path: string) => isNoteEncrypted(path),
  toggleBookmarkNote: (path: string, name: string) => {
    const existing = useBookmarkStore.getState().findBookmark(path)
    if (existing) {
      commandRegistry.execute('edit_bookmark_dialog', existing)
      return
    }
    commandRegistry.execute('open_bookmark_dialog', { path, name })
  },

  // Inside an encrypted repository the files are already encrypted by the volume, so the
  // per-note operations are not offered at all.
  encryptNote: repoUnlocked ? undefined : async (path: string) => {
    // Lock first, then encrypt: the pane unmounts the editor before the file changes, so no
    // pending save can write the plaintext back over the freshly encrypted note. It uses the
    // passphrase from Settings, without asking.
    const store = useNoteEncryptionStore.getState()
    store.markEncrypted(path)
    store.lock(path)
    try {
      await encryptNoteFile(path)
      toast.success(i18n.t('contextmenu.explorer.encrypt_note_done'))
    } catch (error) {
      // The file is unchanged, so the note opens again.
      store.markDecrypted(path)
      store.unlock(path)
      toast.error(error instanceof Error ? error.message : String(error))
    }
  },
  encryptNotesInFolder: repoUnlocked ? undefined : encryptNotesInFolder,
  decryptNote: async (path: string) => {
    const passphrase = await dialog.inputConfirm({
      title: i18n.t('contextmenu.explorer.decrypt_note_passphrase'),
      inputProps: {
        type: 'password',
        placeholder: i18n.t('settings.encryption.passphrase.placeholder'),
      },
    })
    if (typeof passphrase !== 'string' || !passphrase) return
    await reportEncryptionResult(
      () => decryptNoteFileWithPassphrase(path, passphrase),
      'contextmenu.explorer.decrypt_note_done',
    )
  },
})

const runFileMutation: RunFileMutation = (operation) =>
  savePathCoordinator.runFileMutation((lease) =>
    operation({
      protectFileIds: (fileIds) => flushSync(() => lease.protectFileIds(fileIds)),
      protectPaths: (paths) => flushSync(() => lease.protectPaths(paths)),
    }),
  )

export const TauriFileSystemProvider: FC<FileSystemAdapterProps> = ({ children }) => {
  const fileExcludePatterns = useAppSettingStore((state) =>
    resolveFileExcludePatterns(state.settingData),
  )

  const repoUnlocked = useRepoStore((state) => state.isUnlocked)
  const appContextValue = useMemo(() => buildDesktopAppContext(repoUnlocked), [repoUnlocked])

  const value: FileSystemContextValue = useMemo(() => ({
    runFileMutation,

    readDirectory: async (folderPath: string): Promise<IFile[]> => {
      const read = () =>
        invoke<DirectoryReadResult>('open_folder_async', {
          folderPath,
          rootPath: folderPath,
          fileExcludePatterns,
        })

      const result = await read()
      if (result.message === 'repo_locked') {
        useRepoStore.getState().setBlocked(folderPath)
        return []
      }
      return hydrateDirectoryEntries(unwrapDirectoryReadResult(result))
    },

    readSubdirectory: async (folderPath: string): Promise<IFile[]> => {
      const rootPath = useEditorStore.getState().getRootPath() || folderPath
      const result = await invoke<DirectoryReadResult>('open_folder_async', {
        folderPath,
        rootPath,
        fileExcludePatterns,
      })
      if (result.message === 'repo_locked') {
        useRepoStore.getState().setBlocked(folderPath)
        return []
      }

      let entries: DirectoryReadEntry[]
      try {
        entries = unwrapDirectoryReadResult(result)
      } catch (error) {
        logger.error(`Failed to read subdirectory at ${folderPath}`, error)
        throw error
      }

      if ((useEditorStore.getState().getRootPath() || folderPath) !== rootPath) {
        return []
      }
      return hydrateDirectoryEntries(entries)
    },

    writeFile: async (filePath: string, content: string): Promise<void> => {
      const result = await invoke<FileSysResult>('write_file', { filePath, content })
      if (result.code !== FileResultCode.Success) throw new Error(result.content)
    },

    deleteFile: async (filePath: string): Promise<void> => {
      await invoke('delete_file', { filePath })
    },

    deleteFolder: async (filePath: string): Promise<void> => {
      await invoke('delete_folder', { filePath })
    },

    trashFile: async (filePath: string): Promise<void> => {
      await invoke('trash_delete', { path: filePath })
    },

    isDir: async (path: string): Promise<boolean> => {
      return await invoke<boolean>('is_dir', { path })
    },

    fileExists: async (filePath: string): Promise<boolean> => {
      return await invoke<boolean>('file_exists', { filePath })
    },

    pathsReferToSameDirectoryEntry: async (path1: string, path2: string): Promise<boolean> => {
      return await invoke<boolean>('paths_refer_to_same_directory_entry', { path1, path2 })
    },

    moveFilesToTargetFolder: async (params: {
      files: string[]
      targetFolder: string
      replaceExist?: boolean
    }): Promise<MoveFileInfo[]> => {
      return await invoke('move_files_to_target_folder', {
        files: params.files,
        targetFolder: params.targetFolder,
        replaceExist: params.replaceExist,
      })
    },

    pathJoin: async (path1: string, path2: string): Promise<string> => {
      return await invoke<string>('path_join', { path1, path2 })
    },

    getPathName: async (path: string): Promise<string> => {
      return await invoke<string>('get_path_name', { path })
    },

    getFileContent: async (filePath: string): Promise<string | null> => {
      try {
        const content = await invoke<string>('read_file', { filePath })
        return content
      } catch {
        return null
      }
    },

    getMdRelativePath: async (filePath: string, relativeTo: string): Promise<string> => {
      const res = await invoke<{ code: FileResultCode; content: string }>('get_md_relative_path', {
        filePath,
        relativeTo,
      })
      if (res.code !== FileResultCode.Success) {
        return filePath
      }
      return res.content
    },

    createFolder: async (path: string): Promise<void> => {
      await invoke('create_folder', { path })
    },

    renameFile: async (oldPath: string, newPath: string): Promise<MoveFileInfo> => {
      return await invoke<MoveFileInfo>('rename_fs', { oldPath, newPath })
    },

    copyFile: copySavedFile,
    selectCopyDirectory,

    revealInFolder: async (path: string): Promise<void> => {
      await revealItemInDir(path)
    },
  }), [fileExcludePatterns])

  // Bulk actions read the folder from disk: a folder that was never expanded has no loaded
  // children in the tree, and would report itself as empty.
  useEffect(() => {
    setFolderReader(value.readSubdirectory)
  }, [value.readSubdirectory])

  return (
    <AppContext.Provider value={appContextValue}>
      <FileSystemContext.Provider value={value}>{children}</FileSystemContext.Provider>
    </AppContext.Provider>
  )
}
