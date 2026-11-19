import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { setTimeout as pause } from 'node:timers/promises'
import { build } from 'esbuild'

const { outputFiles: [bundle] } = await build({
  stdin: {
    contents: 'export * from "./workspace-host"; export * from "./workspace-host-identity";',
    resolveDir: fileURLToPath(new URL('.', import.meta.url))
  },
  format: 'esm',
  platform: 'node',
  bundle: true,
  write: false,
  plugins: [{
    name: 'electron-test',
    setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test' }))
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
        contents: 'export const { safeStorage, utilityProcess } = globalThis.workspaceHostTestElectron;'
      }))
    }
  }]
})

const children = []
globalThis.workspaceHostTestElectron = {
  safeStorage: {
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => 'test',
    encryptStringAsync: async (value) => Buffer.from(value, 'utf8').reverse(),
    decryptStringAsync: async (value) => ({
      result: Buffer.from(value).reverse().toString('utf8'),
      shouldReEncrypt: false
    })
  },
  utilityProcess: {
    fork() {
      const child = Object.assign(new EventEmitter(), {
        kill() { setImmediate(() => child.emit('exit')) },
        postMessage(config) {
          child.config = config
          child.emit('message', 'online')
        }
      })
      children.push(child)
      setImmediate(() => child.emit('spawn'))
      return child
    }
  }
}
const { WorkspaceHost, workspaceHostIdentity } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.contents).toString('base64')}`
)
delete globalThis.workspaceHostTestElectron

test('switching accounts never claims the legacy ID or another account credential', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ocean-host-'))
  try {
    const legacy = '1f02365c-6a96-4123-a572-5c11d97d7044'
    writeFileSync(join(directory, 'workspace-host.json'), JSON.stringify({ hostId: legacy }))
    const alice = workspaceHostIdentity(directory, 'https://gateway', 'alice')
    const bob = workspaceHostIdentity(directory, 'https://gateway', 'bob')
    assert.notEqual(alice.hostId, legacy)
    assert.notEqual(bob.hostId, legacy)
    assert.notEqual(alice.hostId, bob.hostId)
    assert.notEqual(alice.credentialPath, bob.credentialPath)
    assert.deepEqual(workspaceHostIdentity(directory, 'https://gateway', 'alice'), alice)
    assert.notEqual(workspaceHostIdentity(directory, 'https://other', 'alice').hostId, alice.hostId)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('account switch stops the previous process and switching back uses its encrypted credential', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ocean-host-'))
  const host = new WorkspaceHost('https://gateway', directory, 'host.cjs')
  const previousFetch = globalThis.fetch
  const registrations = []
  globalThis.fetch = async (url, request) => {
    const accountId = request.headers.Authorization.slice('Bearer '.length)
    if (url.endsWith('/account')) return Response.json({ accountId })
    assert.equal(children.at(-1)?.listenerCount('exit') ?? 0, 0)
    const { hostId } = JSON.parse(request.body)
    const credential = 'ocean_wh_' + (accountId === 'alice' ? 'ab' : 'cd').repeat(32)
    registrations.push({ accountId, hostId, credential })
    return Response.json({ success: true, data: { hostId, credential } })
  }
  const waitOnline = async () => {
    for (let attempt = 0; attempt < 100 && host.status().health !== 'online'; attempt++) {
      await pause(5)
    }
    assert.equal(host.status().health, 'online')
    return { status: host.status(), config: children.at(-1).config }
  }
  try {
    host.login('alice')
    const alice = await waitOnline()
    host.login('bob')
    assert.equal(host.status().info, undefined)
    const bob = await waitOnline()
    assert.notEqual(alice.status.info.hostId, bob.status.info.hostId)
    assert.notEqual(alice.config.credential, bob.config.credential)

    host.login('alice')
    assert.deepEqual(await waitOnline(), alice)
    assert.deepEqual(registrations.map(({ accountId }) => accountId), ['alice', 'bob'])
    const files = readdirSync(directory).filter((name) => name.endsWith('.credential'))
    assert.equal(files.length, 2)
    for (const name of files) {
      assert.equal(readFileSync(join(directory, name), 'utf8').includes('ocean_wh_'), false)
    }
    assert.equal(JSON.stringify(host.status()).includes('credential'), false)
  } finally {
    await host.stop()
    globalThis.fetch = previousFetch
    rmSync(directory, { recursive: true, force: true })
  }
  assert.deepEqual(host.status(), { info: undefined, health: 'signed-out' })
})
