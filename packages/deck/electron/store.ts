// Tiny JSON settings store in Electron's userData folder.
// Secrets are encrypted with the OS keyring via safeStorage when it is available
// (in Steam Deck Gaming Mode there is often no keyring, so we fall back to a
// file that only the current user can read).

import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const SECRET_KEYS = new Set(['userToken'])

export class Store {
  private file: string
  private data: Record<string, unknown> = {}

  constructor(name = 'greenlight-deck.json') {
    this.file = path.join(app.getPath('userData'), name)
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    } catch {
      this.data = {}
    }
  }

  get(key: string): unknown {
    const value = this.data[key]
    if (SECRET_KEYS.has(key) && value && typeof value === 'object' && (value as any).__enc) {
      try {
        const buf = Buffer.from((value as any).__enc, 'base64')
        return JSON.parse(safeStorage.decryptString(buf))
      } catch {
        return undefined
      }
    }
    return value
  }

  set(key: string, value: unknown) {
    if (SECRET_KEYS.has(key) && safeStorage.isEncryptionAvailable() && this.hasRealKeyring()) {
      const enc = safeStorage.encryptString(JSON.stringify(value)).toString('base64')
      this.data[key] = { __enc: enc }
    } else {
      this.data[key] = value
    }
    this.flush()
  }

  delete(key: string) {
    delete this.data[key]
    this.flush()
  }

  private hasRealKeyring() {
    // 'basic_text' means Chromium would use a hard-coded key; not worth the indirection.
    try {
      return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'
    } catch {
      return true
    }
  }

  private flush() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, this.file)
  }
}
