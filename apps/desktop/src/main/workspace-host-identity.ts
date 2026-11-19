import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function workspaceHostIdentity(directory: string, gateway: string, accountId: string) {
  // The legacy installation ID has no locally recorded owner. Never adopt it for a login.
  const scope = createHash('sha256').update(JSON.stringify([gateway, accountId])).digest('hex')
  const path = join(directory, `workspace-host-${scope}.id`)
  try {
    writeFileSync(path, randomUUID(), { mode: 0o600, flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const hostId = readFileSync(path, 'utf8')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(hostId)) {
    throw new Error('Invalid stored Workspace Host identity')
  }
  return { hostId, credentialPath: join(directory, `workspace-host-${scope}.credential`) }
}
