import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as DiagnosticsModule from './editorPerformanceDiagnostics'

let diagnostics: typeof DiagnosticsModule
let clock = 0
let nextFrame = 0
const frames = new Map<number, FrameRequestCallback>()
const advanceFrame = () => {
  clock += 16
  const callbacks = [...frames.values()]
  frames.clear()
  callbacks.forEach((callback) => callback(clock))
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  clock = 0
  frames.clear()
  window.localStorage.setItem('mf:editor-performance', '1')
  delete window.__MF_EDITOR_PERFORMANCE__
  vi.spyOn(window.performance, 'now').mockImplementation(() => clock)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id)
  })
  diagnostics = await import('./editorPerformanceDiagnostics')
})

afterEach(() => {
  window.localStorage.clear()
  document.body.replaceChildren()
  vi.clearAllTimers()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('editor open diagnostics', () => {
  it('is opt-in, measures exact UTF-8 bytes after ready, and does not expose content or paths', async () => {
    window.localStorage.clear()
    expect(diagnostics.beginEditorOpenMeasurement('file')).toBeUndefined()
    expect(window.__MF_EDITOR_PERFORMANCE__).toBeUndefined()
    window.localStorage.setItem('mf:editor-performance', '1')
    const id = diagnostics.beginEditorOpenMeasurement('file')
    const encode = vi.spyOn(TextEncoder.prototype, 'encode')
    diagnostics.recordEditorOpenContent(id, '中文😀')
    expect(window.__MF_EDITOR_PERFORMANCE__?.opens?.[0].byteLength).toBeUndefined()
    expect(encode).not.toHaveBeenCalled()
    expect(JSON.stringify(window.__MF_EDITOR_PERFORMANCE__)).not.toContain('中文')
    diagnostics.finishEditorOpenMeasurement(id, 'ready')
    expect(window.__MF_EDITOR_PERFORMANCE__?.opens?.[0].duration).toBe(0)
    expect(encode).not.toHaveBeenCalled()
    await vi.runOnlyPendingTimersAsync()
    expect(encode).toHaveBeenCalledExactlyOnceWith('中文😀')
    expect(window.__MF_EDITOR_PERFORMANCE__?.opens?.[0].byteLength).toBe(10)
    expect(window.__MF_EDITOR_PERFORMANCE__?.opens?.[0].stages.at(-1)).toMatchObject({
      stage: 'content-measured',
      durationMs: 0,
    })
    expect(JSON.stringify(window.__MF_EDITOR_PERFORMANCE__)).not.toContain('中文')
  })

  it('drops canceled content without paying the deferred encoding cost', async () => {
    const requestId = diagnostics.beginEditorOpenMeasurement('file')
    const encode = vi.spyOn(TextEncoder.prototype, 'encode')
    diagnostics.recordEditorOpenContent(requestId, 'x'.repeat(2 * 1024 * 1024))
    diagnostics.finishEditorOpenMeasurement(requestId, 'canceled')
    await vi.runOnlyPendingTimersAsync()

    expect(encode).not.toHaveBeenCalled()
    expect(window.__MF_EDITOR_PERFORMANCE__!.opens![0].byteLength).toBeUndefined()
  })

  it('fingerprints initial UTF-8 bytes after ready and keeps hashing failures out of the editor path', async () => {
    let finish!: (hash: ArrayBuffer) => void
    const digest = vi.fn(() => new Promise<ArrayBuffer>((resolve) => { finish = resolve }))
    vi.stubGlobal('crypto', { subtle: { digest } })
    const id = diagnostics.beginEditorOpenMeasurement('file')
    diagnostics.recordEditorOpenContent(id, '中文😀')
    diagnostics.finishEditorOpenMeasurement(id, 'ready')
    expect(digest).not.toHaveBeenCalled()
    await vi.runOnlyPendingTimersAsync()
    expect(digest).toHaveBeenCalledExactlyOnceWith('SHA-256', new TextEncoder().encode('中文😀'))
    expect(window.__MF_EDITOR_PERFORMANCE__!.opens![0].contentSha256).toBeUndefined()
    finish(new Uint8Array(32).fill(10).buffer)
    await Promise.resolve()
    expect(window.__MF_EDITOR_PERFORMANCE__!.opens![0].contentSha256).toBe('0a'.repeat(32))

    digest.mockRejectedValueOnce(new Error('unavailable'))
    const next = diagnostics.beginEditorOpenMeasurement('next')
    diagnostics.recordEditorOpenContent(next, 'unchanged')
    diagnostics.finishEditorOpenMeasurement(next, 'ready')
    await vi.runOnlyPendingTimersAsync()
    expect(window.__MF_EDITOR_PERFORMANCE__!.opens![1]).toMatchObject({ status: 'ready', byteLength: 9 })
    expect(window.__MF_EDITOR_PERFORMANCE__!.opens![1].contentSha256).toBeUndefined()
  })

  it('correlates commands, cancels superseded views, and records each stage once', () => {
    const first = diagnostics.beginEditorOpenMeasurement('a', { viewId: 'left' })
    clock = 20
    const current = diagnostics.beginEditorOpenMeasurement('file', {
      viewId: 'left',
      kind: 'switch',
    })
    diagnostics.recordEditorOpenStage(first, 'obsolete')
    diagnostics.recordEditorOpenStage(current, 'parse', { runtimeElapsedMs: 10 })
    clock = 50
    diagnostics.recordEditorOpenStage(current, 'parse', {
      runtimeElapsedMs: 20,
      durationMs: 9,
      blockCount: 42,
    })
    expect(diagnostics.getEditorOpenMeasurement('a', 'left')).toBeUndefined()
    expect(diagnostics.getEditorOpenMeasurement('file', 'left')).toBe(current)
    const samples = window.__MF_EDITOR_PERFORMANCE__!.opens!
    expect(samples[0]).toMatchObject({ status: 'canceled', duration: 20 })
    expect(samples[1].stages.map((entry) => entry.stage)).toEqual(['requested', 'parse'])
    expect(samples[1].stages[1]).toMatchObject({
      elapsedMs: 0,
      latestElapsedMs: 30,
      runtimeElapsedMs: 20,
      durationMs: 9,
    })
    expect(samples[1].blockCount).toBe(42)
    diagnostics.finishEditorOpenMeasurement(current, 'ready')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains the host content revision that owns each recorded runtime stage', () => {
    const requestId = diagnostics.beginEditorOpenMeasurement('file', { viewId: 'right' })
    diagnostics.recordEditorOpenStage(requestId, 'host-content-ready', { contentRevision: 7 })
    diagnostics.recordEditorOpenStage(requestId, 'runtime-ready', {
      blockCount: 42,
      contentRevision: 7,
      mode: 'sourceCode',
      moduleState: 'warm',
      runtimeEntrySha256: 'a'.repeat(64),
      runtimeVersion: '0.1.11',
    })

    expect(window.__MF_EDITOR_PERFORMANCE__!.opens![0]).toMatchObject({
      blockCount: 42,
      contentRevision: 7,
      fileId: 'file',
      mode: 'sourceCode',
      moduleState: 'warm',
      openRequestId: requestId,
      runtimeEntrySha256: 'a'.repeat(64),
      runtimeVersion: '0.1.11',
      viewId: 'right',
    })
  })

  it('records frame gaps without claiming native Long Tasks support', () => {
    const requestId = diagnostics.beginEditorOpenMeasurement('file')
    clock = 100
    advanceFrame()
    expect(window.__MF_EDITOR_PERFORMANCE__!.responsiveness).toContainEqual({
      fileId: 'file',
      viewId: 'file',
      openRequestId: requestId,
      source: 'frame-gap',
      duration: 116,
      recordedAt: 116,
    })
    diagnostics.finishEditorOpenMeasurement(requestId, 'ready')
  })

  it('attributes WebKit fallback samples to every opening active during the gap', () => {
    const left = diagnostics.beginEditorOpenMeasurement('left-file', { viewId: 'left' })
    const right = diagnostics.beginEditorOpenMeasurement('right-file', { viewId: 'right' })
    clock = 100
    advanceFrame()

    expect(window.__MF_EDITOR_PERFORMANCE__!.responsiveness).toEqual([
      {
        fileId: 'left-file',
        viewId: 'left',
        openRequestId: left,
        source: 'frame-gap',
        duration: 116,
        recordedAt: 116,
      },
      {
        fileId: 'right-file',
        viewId: 'right',
        openRequestId: right,
        source: 'frame-gap',
        duration: 116,
        recordedAt: 116,
      },
    ])
    diagnostics.finishEditorOpenMeasurement(left, 'canceled')
    diagnostics.finishEditorOpenMeasurement(right, 'canceled')
  })

  it('attributes a delayed native Long Task delivery to the opening interval it crossed', () => {
    let deliver: PerformanceObserverCallback | undefined
    class FakePerformanceObserver {
      constructor(callback: PerformanceObserverCallback) {
        deliver = callback
      }

      observe() {}

      disconnect() {}
    }
    vi.stubGlobal('PerformanceObserver', FakePerformanceObserver)

    const requestId = diagnostics.beginEditorOpenMeasurement('file', { viewId: 'right' })
    clock = 40
    diagnostics.finishEditorOpenMeasurement(requestId, 'ready')
    deliver?.(
      {
        getEntries: () => [{ duration: 50, startTime: 10 } as PerformanceEntry],
      } as PerformanceObserverEntryList,
      {} as PerformanceObserver,
    )

    expect(window.__MF_EDITOR_PERFORMANCE__!.longTasks).toEqual([
      {
        fileId: 'file',
        viewId: 'right',
        openRequestId: requestId,
        duration: 50,
        startTime: 10,
      },
    ])
  })

  it('does not attach a late commit to a superseding open of the same file and pane', () => {
    const obsoleteRequestId = diagnostics.beginEditorOpenMeasurement('file')
    diagnostics.finishEditorOpenMeasurement(obsoleteRequestId, 'canceled')
    const currentRequestId = diagnostics.beginEditorOpenMeasurement('file')
    diagnostics.recordEditorOpenStage(currentRequestId, 'surface-committed')
    diagnostics.recordEditorInteractionMeasurement('file', 0, 'file', 'commit', obsoleteRequestId)
    expect(window.__MF_EDITOR_PERFORMANCE__!.interactionCommits).toHaveLength(1)
    expect(window.__MF_EDITOR_PERFORMANCE__!.opens![0].firstInputCommitDuration).toBeUndefined()
    expect(window.__MF_EDITOR_PERFORMANCE__!.opens![1].firstInputCommitDuration).toBeUndefined()
    expect(window.__MF_EDITOR_PERFORMANCE__!.interactionCommits![0].openRequestId).toBe(
      obsoleteRequestId,
    )
  })
})
