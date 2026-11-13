/**
 * A line that is only HTML (like `<u>text</u>`) opens a raw HTML block, and Markdown passes
 * everything up to the next blank line through untouched — so `~~x~~` and `==x==` written
 * right below it stay literal. The Android app writes notes this way, so the preview closes
 * the block for display: an HTML-only line is followed by a blank line.
 *
 * The file is never modified; only what the preview renders.
 */
const FENCE = /(```[\s\S]*?```|`[^`\n]*`)/g
const TAGS_ONLY = /^\s*(?:<\/?[a-z][\w-]*\b[^>]*>\s*)+$/i
/** A single element wrapping its own text, like <u>text</u>: the parser opens a raw block on it. */
const WRAPPED_ELEMENT = /^\s*<([a-z][\w-]*)\b[^>]*>.*<\/\1>\s*$/i
const isHtmlLine = (line: string) => TAGS_ONLY.test(line) || WRAPPED_ELEMENT.test(line)

export const closeHtmlBlocks = (markdown: string): string => {
  const parts = markdown.split(FENCE)

  return parts
    .map((chunk, index) => {
      // Odd indexes are code: leave them byte for byte.
      if (index % 2 === 1) return chunk

      const lines = chunk.split('\n')
      const out: string[] = []
      lines.forEach((line, lineIndex) => {
        out.push(line)
        const next = lines[lineIndex + 1]
        const htmlLine = isHtmlLine(line)
        // A blank line already closes the block, and the end of the text needs nothing.
        if (htmlLine && next !== undefined && next.trim() !== '' && !isHtmlLine(next)) {
          out.push('')
        }
      })
      return out.join('\n')
    })
    .join('')
}
