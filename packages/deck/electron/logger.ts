// Debug log: captures main-process console output and renderer log lines in a
// ring buffer, mirrors them to a rotating file in userData/logs, and scrubs
// anything that looks like a token so logs are safe to paste into an issue.

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  t: number
  level: LogLevel
  source: 'main' | 'ui' | 'stream'
  msg: string
}

const MAX_ENTRIES = 2000
const MAX_FILE_BYTES = 1_000_000

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(Bearer|XBL3\.0 x=[^;]*;)\s*[A-Za-z0-9._\-+/=]{20,}/g, '$1 [redacted]'],
  [/("?(?:access_token|refresh_token|id_token|gsToken|Token|token|device_code)"?\s*[:=]\s*"?)[A-Za-z0-9._\-+/=]{16,}/g, '$1[redacted]'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-jwt]'],
  [/M\.[A-Z0-9]{3,}_[A-Za-z0-9!*$_\-]{40,}/g, '[redacted-refresh]'],
]

export function scrub(text: string): string {
  let out = text
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep)
  return out
}

class Logger {
  private entries: LogEntry[] = []
  private file: string | undefined
  private stream: fs.WriteStream | undefined

  init() {
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    this.file = path.join(dir, 'greenlight-deck.log')
    try {
      if (fs.existsSync(this.file) && fs.statSync(this.file).size > MAX_FILE_BYTES) {
        fs.renameSync(this.file, `${this.file}.1`)
      }
    } catch { /* ignore */ }
    this.stream = fs.createWriteStream(this.file, { flags: 'a' })
    this.add('info', 'main', `--- Greenlight Deck ${app.getVersion()} started (${process.platform}, Electron ${process.versions.electron}) ---`)

    // Capture main-process console output.
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      const original = console[level].bind(console)
      console[level] = (...args: unknown[]) => {
        original(...args)
        this.add(level === 'log' ? 'info' : level, 'main', util.format(...args))
      }
    }
    process.on('uncaughtException', (err) => this.add('error', 'main', `Uncaught: ${err.stack ?? err}`))
    process.on('unhandledRejection', (err) => this.add('error', 'main', `Unhandled rejection: ${(err as Error)?.stack ?? err}`))
  }

  add(level: LogLevel, source: LogEntry['source'], msg: string) {
    const entry: LogEntry = { t: Date.now(), level, source, msg: scrub(msg).slice(0, 4000) }
    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES)
    this.stream?.write(`${format(entry)}\n`)
  }

  recent(limit = 400): LogEntry[] {
    return this.entries.slice(-limit)
  }

  text(): string {
    return this.entries.map(format).join('\n')
  }

  filePath() {
    return this.file
  }

  clear() {
    this.entries = []
    this.add('info', 'main', 'Log cleared')
  }
}

function format(e: LogEntry) {
  return `${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} [${e.source}] ${e.msg}`
}

export const logger = new Logger()
