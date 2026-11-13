import { markStartupInteractive, startupInteractive } from './interactive'

/** Scheduling readiness is independent of opt-in performance diagnostics. */
export function observeStartupEditable(
  container: HTMLElement,
  isCurrent: () => boolean,
  onReady?: () => void,
) {
  if (startupInteractive.getOutcome()) return () => {}
  let frame: number
  let confirmed = false
  let canceled = false
  const check = () => {
    if (canceled || startupInteractive.getOutcome() || !isCurrent() || !container.isConnected) return
    const content = container.querySelector<HTMLElement>('.cm-content')
    const bounds = content?.getBoundingClientRect()
    const valid = Boolean(
      content && bounds && bounds.width > 0 && bounds.height > 0 &&
      getComputedStyle(content).visibility !== 'hidden' &&
      document.visibilityState !== 'hidden',
    )
    if (valid && confirmed) {
      const readOnly = content?.getAttribute('contenteditable') !== 'true'
      onReady?.()
      markStartupInteractive(readOnly ? 'preview' : 'editable')
      return
    }
    confirmed = valid
    frame = window.requestAnimationFrame(check)
  }
  frame = window.requestAnimationFrame(check)
  return () => {
    canceled = true
    window.cancelAnimationFrame(frame)
  }
}
