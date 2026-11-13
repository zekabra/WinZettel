import {
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileJsonIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  type LucideIcon,
} from 'lucide-react'

/**
 * One icon per file type, decided in a single place.
 *
 * The tree, the quick open list and the global search used to disagree: search showed a
 * page for everything, so a `.txt` looked like a note. Every surface now asks here.
 */
const NOTE = new Set(['md', 'markdown', 'mdx', 'txt', 'log'])
const CODE = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rs',
  'go',
  'java',
  'kt',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'rb',
  'php',
  'sh',
  'bash',
  'ps1',
  'sql',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
])
const SHEET = new Set(['csv', 'tsv'])
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff'])
const DOCUMENT = new Set(['pdf', 'doc', 'docx', 'odt', 'rtf'])

const extensionOf = (value?: string): string => {
  if (!value) return ''
  const name = value.split(/[\\/]/).pop() ?? value
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : name.toLowerCase()
}

export const fileTypeIcon = (extOrName?: string): LucideIcon => {
  const ext = extensionOf(extOrName)
  if (ext === 'json') return FileJsonIcon
  if (NOTE.has(ext)) return FileTextIcon
  if (CODE.has(ext)) return FileCodeIcon
  if (SHEET.has(ext)) return FileSpreadsheetIcon
  if (IMAGE.has(ext)) return FileImageIcon
  if (DOCUMENT.has(ext)) return FileTypeIcon
  return FileIcon
}
