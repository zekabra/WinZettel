import { toast } from 'zens'

/**
 * One notice per message, not one per attempt.
 *
 * A refusal is often reached from several places at once — both panes resolving their
 * initial mode, the switcher, a keyboard command — and the owner should read it once.
 */
const lastShown = new Map<string, number>()

export const notifyOnce = (key: string, show: () => void, ttlMs = 2000): void => {
  const now = Date.now()
  const previous = lastShown.get(key) ?? 0
  if (now - previous < ttlMs) return
  lastShown.set(key, now)
  show()
}

export const notifyErrorOnce = (key: string, message: string, ttlMs = 2000): void => {
  notifyOnce(key, () => toast.error(message), ttlMs)
}
