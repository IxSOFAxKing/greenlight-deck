// Gives the "Greenlight Deck" non-Steam shortcut proper library artwork.
//
// Steam keeps non-Steam shortcuts in userdata/<user>/config/shortcuts.vdf (a
// binary KeyValues file) and custom art in userdata/<user>/config/grid named
// after the shortcut's app id. On launch we look for our shortcut and drop in
// any art that is missing. Art the user picked themselves is never replaced.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type VdfValue = string | number | VdfMap
export interface VdfMap { [key: string]: VdfValue }

/** Parses Steam's binary KeyValues format (as used by shortcuts.vdf). */
export function parseBinaryVdf(buf: Buffer): VdfMap {
  let pos = 0
  const readString = (): string => {
    const end = buf.indexOf(0, pos)
    if (end < 0) throw new Error('Unterminated string')
    const s = buf.toString('utf8', pos, end)
    pos = end + 1
    return s
  }
  const readMap = (): VdfMap => {
    const map: VdfMap = {}
    while (pos < buf.length) {
      const type = buf[pos++]
      if (type === 0x08) return map
      const key = readString()
      if (type === 0x00) map[key] = readMap()
      else if (type === 0x01) map[key] = readString()
      else if (type === 0x02) { map[key] = buf.readUInt32LE(pos); pos += 4 }
      else if (type === 0x07) { map[key] = Number(buf.readBigUInt64LE(pos)); pos += 8 }
      else throw new Error(`Unknown VDF type 0x${type.toString(16)}`)
    }
    return map
  }
  return readMap()
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(s: string): number {
  let c = 0xffffffff
  for (const b of Buffer.from(s, 'utf8')) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface Shortcut { appId: number; name: string; exe: string }

const field = (m: VdfMap, name: string): VdfValue | undefined => {
  const key = Object.keys(m).find((k) => k.toLowerCase() === name)
  return key === undefined ? undefined : m[key]
}

/** Lists shortcuts with the app id Steam uses to name their grid art. */
export function readShortcuts(buf: Buffer): Shortcut[] {
  const root = parseBinaryVdf(buf)
  const list = field(root, 'shortcuts')
  if (!list || typeof list !== 'object') return []
  return Object.values(list).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const name = String(field(entry, 'appname') ?? '')
    const exe = String(field(entry, 'exe') ?? '')
    const id = field(entry, 'appid')
    // Older Steam builds don't store the id; it is derived from exe + name.
    const appId = typeof id === 'number' && id !== 0 ? id >>> 0 : (crc32(exe + name) | 0x80000000) >>> 0
    return [{ appId, name, exe }]
  })
}

export function isOurShortcut(s: Shortcut): boolean {
  return /greenlight[ _-]?deck/i.test(s.exe) || /greenlight[ _-]?deck/i.test(s.name)
}

/** Grid file name suffix → bundled image. */
export const ART: Array<[suffix: string, file: string]> = [
  ['p', 'cover.png'], // library capsule 600×900
  ['', 'wide.png'], // wide capsule 920×430
  ['_hero', 'hero.png'], // header 1920×620
  ['_logo', 'logo.png'], // logo drawn over the hero
]

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.ico']

export function steamRoots(home = os.homedir()): string[] {
  const candidates = [
    path.join(home, '.steam', 'steam'),
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  ]
  const seen = new Set<string>()
  return candidates.filter((dir) => {
    try {
      const real = fs.realpathSync(dir)
      if (seen.has(real) || !fs.existsSync(path.join(real, 'userdata'))) return false
      seen.add(real)
      return true
    } catch {
      return false
    }
  })
}

export interface ArtResult { found: number; written: string[] }

/** Writes any missing artwork for our shortcut in every Steam user found. */
export function applySteamArt(artDir: string, roots = steamRoots()): ArtResult {
  const result: ArtResult = { found: 0, written: [] }
  for (const root of roots) {
    const userdata = path.join(root, 'userdata')
    let users: string[] = []
    try { users = fs.readdirSync(userdata) } catch { continue }
    for (const user of users) {
      const config = path.join(userdata, user, 'config')
      let shortcuts: Shortcut[]
      try {
        shortcuts = readShortcuts(fs.readFileSync(path.join(config, 'shortcuts.vdf'))).filter(isOurShortcut)
      } catch {
        continue
      }
      if (!shortcuts.length) continue
      const grid = path.join(config, 'grid')
      fs.mkdirSync(grid, { recursive: true })
      const existing = new Set(fs.readdirSync(grid).map((f) => f.toLowerCase()))
      for (const s of shortcuts) {
        result.found++
        for (const [suffix, file] of ART) {
          const base = `${s.appId}${suffix}`
          if (IMAGE_EXT.some((ext) => existing.has(base + ext))) continue
          const target = path.join(grid, base + '.png')
          fs.writeFileSync(target, fs.readFileSync(path.join(artDir, file)))
          result.written.push(target)
        }
      }
    }
  }
  return result
}
