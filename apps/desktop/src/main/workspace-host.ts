import { safeStorage, utilityProcess, type UtilityProcess } from 'electron'
import { readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { setTimeout as wait } from 'node:timers/promises'
import { workspaceHostIdentity } from './workspace-host-identity'

type Platform = 'darwin' | 'win32' | 'linux'
type HostInfo = { hostId: string; platform: Platform }
type Health = 'signed-out' | 'starting' | 'online' | 'reconnecting' | 'unauthorized' | 'unavailable'
class GatewayUnavailable extends Error {}

const credentialPattern = /^ocean_wh_[0-9a-f]{64}$/

export class WorkspaceHost {
  private session?: AbortController
  private child?: UtilityProcess
  private setup = Promise.resolve()
  private childExit = Promise.resolve()
  private info?: HostInfo
  private health: Health = 'signed-out'

  constructor(
    private readonly gateway: string,
    private readonly directory: string,
    private readonly entry: string
  ) {}

  status() {
    return { info: this.info, health: this.health }
  }

  stop() {
    this.session?.abort()
    this.session = undefined
    this.info = undefined
    this.health = 'signed-out'
    this.child?.kill()
    return this.childExit
  }

  login(token: string) {
    const previousExit = this.stop()
    const session = new AbortController()
    this.session = session
    this.health = 'starting'
    this.setup = Promise.all([previousExit, this.setup]).then(() => this.connect(token, session.signal)).catch((error: unknown) => {
      if (session.signal.aborted) return
      this.health = 'unavailable'
      console.error('[Workspace Host] Startup failed:', error instanceof Error ? error.message : 'Unexpected error')
    })
  }

  private async connect(token: string, signal: AbortSignal) {
    for (let delay = 1_000; ; delay = Math.min(delay * 2, 30_000)) {
      try {
        await this.start(token, signal)
        return
      } catch (error) {
        signal.throwIfAborted()
        if (!(error instanceof GatewayUnavailable)) throw error
        this.health = 'reconnecting'
        await wait(delay, undefined, { signal })
      }
    }
  }

  private async start(token: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const platform = process.platform
    if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') {
      throw new Error('Unsupported Workspace Host platform')
    }
    if (!(await safeStorage.isAsyncEncryptionAvailable()) ||
        (platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
      throw new Error('Secure credential storage unavailable')
    }

    signal.throwIfAborted()

    const request = async (endpoint: string, body?: object) => {
      const response = await fetch(`${this.gateway}/api/workspace-hosts/${endpoint}`, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body),
        redirect: 'manual',
        signal: body ? AbortSignal.timeout(15_000) : AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      }).catch(() => { throw new GatewayUnavailable() })
      if (response.status >= 500) throw new GatewayUnavailable()
      if (!response.ok) throw new Error('Workspace Host request failed')
      return response.json()
    }
    const { accountId } = await request('account')
    signal.throwIfAborted()
    if (typeof accountId !== 'string' || !accountId) throw new Error('Invalid Gateway account')
    const { hostId, credentialPath } = workspaceHostIdentity(this.directory, this.gateway, accountId)
    let credential: string
    let shouldStoreCredential = false
    try {
      const decrypted = await safeStorage.decryptStringAsync(readFileSync(credentialPath))
      credential = decrypted.result
      shouldStoreCredential = decrypted.shouldReEncrypt
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const info = { hostId, platform }
      const { success, data } = await request('register', { ...info, name: 'Ocean Desktop' })
      signal.throwIfAborted()
      if (!success || data?.hostId !== hostId || typeof data.credential !== 'string' || !credentialPattern.test(data.credential)) {
        throw new Error('Invalid Workspace Host registration')
      }
      credential = data.credential
      shouldStoreCredential = true
    }
    signal.throwIfAborted()
    if (!credentialPattern.test(credential)) throw new Error('Invalid stored Workspace Host credential')
    if (shouldStoreCredential) {
      const encrypted = await safeStorage.encryptStringAsync(credential)
      signal.throwIfAborted()
      const temporary = `${credentialPath}.${randomUUID()}.tmp`
      try {
        writeFileSync(temporary, encrypted, { mode: 0o600, flag: 'wx' })
        renameSync(temporary, credentialPath)
      } finally {
        rmSync(temporary, { force: true })
      }
    }
    this.info = { hostId, platform }
    this.launch(hostId, credential, signal)
  }

  private launch(hostId: string, credential: string, signal: AbortSignal, delay = 1_000) {
    if (signal.aborted) return
    const child = utilityProcess.fork(this.entry, [], {
      cwd: this.directory,
      serviceName: 'Ocean Workspace Host',
      stdio: 'ignore'
    })
    this.child = child
    child.once('spawn', () => {
      if (!signal.aborted) child.postMessage({ gateway: this.gateway, hostId, credential })
    })
    child.on('message', (health: unknown) => {
      if (signal.aborted) return
      if (health === 'online' || health === 'reconnecting' || health === 'unauthorized') {
        this.health = health
      }
      if (health === 'online') delay = 1_000
      if (health === 'unauthorized') child.kill()
    })
    child.on('error', () => {
      if (!signal.aborted) this.health = 'unavailable'
      child.kill()
    })
    this.childExit = new Promise<void>((resolve) => child.once('exit', () => {
      if (this.child === child) this.child = undefined
      resolve()
      if (signal.aborted || this.health === 'unauthorized') return
      this.health = 'reconnecting'
      const onAbort = () => clearTimeout(timer)
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        try {
          this.launch(hostId, credential, signal, Math.min(delay * 2, 30_000))
        } catch {
          this.health = 'unavailable'
        }
      }, delay)
      signal.addEventListener('abort', onAbort, { once: true })
    }))
  }
}
