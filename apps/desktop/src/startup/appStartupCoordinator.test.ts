import { expect, it } from 'vitest'
import { createAppStartupCoordinator } from './appStartupCoordinator'

it('leaves engine preparation to the requested editor instead of shell or workspace setup', async () => {
  const coordinator = createAppStartupCoordinator({
    loadShell: async () => 'settings',
    loadWorkspace: async () => 'workspace',
  })
  await coordinator.start()
  expect(coordinator.getSnapshot()).toMatchObject({
    shell: { status: 'ready', data: 'settings' },
    workspace: { status: 'ready', data: 'workspace' },
  })
})
