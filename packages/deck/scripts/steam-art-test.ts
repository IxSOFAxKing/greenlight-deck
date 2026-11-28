import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { readShortcuts, applySteamArt, isOurShortcut } from '../electron/steam-art'

const str = (k: string, v: string) => Buffer.concat([Buffer.from([1]), Buffer.from(k + '\0' + v + '\0')])
const int = (k: string, v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return Buffer.concat([Buffer.from([2]), Buffer.from(k + '\0'), b]) }
const map = (k: string, ...kids: Buffer[]) => Buffer.concat([Buffer.from([0]), Buffer.from(k + '\0'), ...kids, Buffer.from([8])])
const vdf = (...entries: Buffer[]) => Buffer.concat([map('shortcuts', ...entries), Buffer.from([8])])

let pass = 0
const test = (name: string, fn: () => void) => { fn(); pass++; console.log('ok -', name) }

const ours = map('0', int('appid', -123456789), str('AppName', 'Greenlight Deck'), str('Exe', '"/home/deck/Applications/GreenlightDeck.AppImage"'), map('tags'))
const other = map('1', int('appid', 0x80001234), str('AppName', 'Some Emulator'), str('Exe', '"/usr/bin/emu"'), map('tags', str('0', 'favorite')))
const legacy = map('0', str('appname', 'Greenlight Deck'), str('exe', '"/x/GreenlightDeck.AppImage"'))

test('parses shortcuts and unsigned app ids', () => {
  const list = readShortcuts(vdf(ours, other))
  assert.equal(list.length, 2)
  assert.equal(list[0].appId, (-123456789) >>> 0)
  assert.equal(list[0].name, 'Greenlight Deck')
  assert.ok(isOurShortcut(list[0]))
  assert.ok(!isOurShortcut(list[1]))
})

test('derives the id when Steam did not store one', () => {
  const [s] = readShortcuts(vdf(legacy))
  assert.ok(s.appId >= 0x80000000)
})

test('writes missing art and keeps custom art', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'steamart-'))
  const config = path.join(tmp, 'userdata', '42', 'config')
  fs.mkdirSync(path.join(config, 'grid'), { recursive: true })
  fs.writeFileSync(path.join(config, 'shortcuts.vdf'), vdf(ours, other))
  const id = (-123456789) >>> 0
  fs.writeFileSync(path.join(config, 'grid', `${id}_hero.jpg`), 'custom')
  const art = path.resolve('resources/steam')
  const r = applySteamArt(art, [tmp])
  assert.equal(r.found, 1)
  const names = r.written.map((f) => path.basename(f)).sort()
  assert.deepEqual(names, [`${id}.png`, `${id}_logo.png`, `${id}p.png`].sort())
  assert.equal(fs.readFileSync(path.join(config, 'grid', `${id}_hero.jpg`), 'utf8'), 'custom')
  assert.equal(applySteamArt(art, [tmp]).written.length, 0)
  fs.rmSync(tmp, { recursive: true })
})

test('ignores users without shortcuts', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'steamart-'))
  fs.mkdirSync(path.join(tmp, 'userdata', '7', 'config'), { recursive: true })
  assert.deepEqual(applySteamArt(path.resolve('resources/steam'), [tmp]), { found: 0, written: [] })
  fs.rmSync(tmp, { recursive: true })
})
console.log(`${pass} passed`)
