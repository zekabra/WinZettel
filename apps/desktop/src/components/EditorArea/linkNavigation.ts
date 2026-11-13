let generation = 0

/** Every navigation, including one without a fragment, cancels stale work. */
export function beginLinkNavigation() {
  generation += 1
  return generation
}

export function isCurrentLinkNavigation(request: number) {
  return request === generation
}
