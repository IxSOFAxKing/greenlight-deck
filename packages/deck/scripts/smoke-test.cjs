// UI smoke test: loads the built UI with mock data in Electron and drives it
// with keyboard input the same way a controller would. Exits 1 on failure.
//
//   xvfb-run -a npx electron --no-sandbox scripts/smoke-test.cjs dist
//
const { app, BrowserWindow } = require('electron')
const path = require('path')

const dist = path.resolve(process.argv[process.argv.length - 1])
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const consoleErrors = []

function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  (${detail})` : ''}`)
  if (!ok) failures.push(name)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { backgroundThrottling: false } })
  win.webContents.on('console-message', (event, level, message) => {
    const lvl = event?.level ?? level
    const msg = event?.message ?? message
    if (lvl === 'error' || lvl === 3) consoleErrors.push(String(msg))
  })
  const js = (s) => win.webContents.executeJavaScript(s)
  const key = async (k, n = 1) => {
    for (let i = 0; i < n; i++) {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k })
      await wait(200)
    }
  }
  const focused = () => js(`(document.activeElement && (document.activeElement.innerText || document.activeElement.className) || '').slice(0, 80)`)
  const has = (sel) => js(`!!document.querySelector(${JSON.stringify(sel)})`)

  try {
    // Sign-in screen
    await win.loadFile(path.join(dist, 'index.html'), { query: { mock: 'signedout' } })
    await wait(1200)
    check('sign-in screen renders', await has('.signin'))
    check('sign-in button focused', /Sign in/.test(await focused()))
    await key('Return'); await wait(600)
    check('device code shown', await has('.device-code'))

    // Profiles: picker at launch with several saved accounts
    await win.loadFile(path.join(dist, 'index.html'), { query: { mock: '1', accounts: '3', signinDelay: '800' } })
    await wait(1300)
    check('profile picker shows at launch', (await js(`document.querySelectorAll('.profile-card:not(.add)').length`)) === 3)
    await key('Right'); await key('Return'); await wait(900)
    check('picking a profile switches account', (await js(`(document.querySelector('.gamertag') || {}).innerText`)) === 'NightOwlKid')
    await js(`document.querySelector('.profile').click(); 1`); await wait(500)
    check('profile chip opens the picker', await has('.modal.profiles'))
    await js(`document.querySelector('.profile-card.add').focus(); 1`); await key('Return'); await wait(500)
    await key('Return'); await wait(1600)
    check('add account signs in a new profile', (await js(`(document.querySelector('.gamertag') || {}).innerText`)) === 'SpeedRunSam')

    // Home
    await win.loadFile(path.join(dist, 'index.html'), { query: { mock: '1' } })
    await wait(1500)
    check('no picker with one account', !(await has('.profiles')))
    check('console cards render', (await js(`document.querySelectorAll('.console-card').length`)) === 2)
    check('first console focused', /Living Room/.test(await focused()))
    await key('Right')
    check('D-pad right moves focus', /Office/.test(await focused()))

    // Cloud
    await key('E'); await wait(1200)
    check('cloud tab shows posters', (await js(`document.querySelectorAll('.poster').length`)) > 5)
    await key('X'); await wait(500)
    check('X opens search keyboard', await has('.osk'))
    await wait(1200) // let the background library refresh land while the keyboard is open
    check('refresh keeps focus in keyboard', /osk-key|^q$/.test(await js(`document.activeElement.className + ' ' + document.activeElement.innerText`)) )
    await js(`[...document.querySelectorAll('.osk-key')].find(b => b.innerText === 'n').click(); 1`)
    await js(`[...document.querySelectorAll('.osk-key')].find(b => b.innerText === 'e').click(); 1`)
    await wait(300)
    const count = await js(`document.querySelectorAll('.poster').length`)
    check('search filters results', count > 0 && count < 12, `${count} results`)
    await key('Escape'); await wait(500)
    check('B closes keyboard', !(await has('.osk')))
    await wait(600) // focus returns to the grid after the keyboard closes
    await key('Return'); await wait(900)
    check('A opens title details', await has('.detail'))
    check('Play is focused', /Play/.test(await focused()))
    await key('Escape'); await wait(500)
    check('B closes details', !(await has('.detail')))

    // Settings + log viewer
    await key('E'); await wait(800)
    check('settings rows render', (await js(`document.querySelectorAll('.setting-row').length`)) >= 10)
    const before = await js(`document.querySelectorAll('.setting-value')[2].innerText`)
    await key('Down', 2); await key('Right'); await wait(300)
    const after = await js(`document.querySelectorAll('.setting-value')[2].innerText`)
    check('right changes a setting value', before !== after, `${before} → ${after}`)
    await js(`[...document.querySelectorAll('.settings-actions .btn')].find(b => b.innerText === 'Debug log').focus(); 1`)
    await key('Return'); await wait(900)
    check('debug log opens', (await js(`document.querySelectorAll('.log-line').length`)) > 0)
    await key('Escape'); await wait(400)
    check('debug log closes', !(await has('.log-panel')))

    // Stream screen error path (mock streams always fail)
    await key('Q'); await key('Q'); await wait(800)
    await key('Return'); await wait(7000)
    check('stream error view shows', await has('.stream-status .error-text'))
    await key('Escape'); await wait(800)
    check('B returns home from stream', await has('.console-card'))
  } catch (err) {
    check('no exceptions', false, err && err.message)
  }

  const realErrors = consoleErrors.filter((m) => !/Mock mode|favicon|net::ERR_/.test(m))
  check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed')
  app.exit(failures.length ? 1 : 0)
})
